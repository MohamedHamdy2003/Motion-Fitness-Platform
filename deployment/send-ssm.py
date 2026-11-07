"""Send the tested deployment script to one EC2 instance and await its result."""

import base64
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
from contextlib import redirect_stdout
from io import StringIO


def required(name, pattern):
    value = os.environ.get(name, "")
    if not re.fullmatch(pattern, value):
        raise ValueError(f"Missing or invalid {name}")
    return value


def command_payload():
    revision = required("GITHUB_SHA", r"[0-9a-f]{40}")
    instance = required("EC2_INSTANCE_ID", r"i-[0-9a-f]{17}")
    user = required("EC2_USER", r"[a-z_][a-z0-9_-]*")
    checkout = required("EC2_PROJECT_PATH", r"/[a-zA-Z0-9_./-]+")
    script = Path(__file__).with_name("update-aws.sh").read_bytes()
    encoded = base64.b64encode(script).decode("ascii")
    # Avoid a PAM systemd user session, which adds overhead on small EC2 instances.
    shell = (
        "set -Eeuo pipefail; "
        f"printf %s {shlex.quote(encoded)} | base64 --decode | "
        f"bash -s -- {shlex.quote(revision)} {shlex.quote(checkout)}"
    )
    return {
        "InstanceIds": [instance],
        "DocumentName": "AWS-RunShellScript",
        "Comment": f"Motion main {revision}",
        "TimeoutSeconds": 900,
        "Parameters": {
            "executionTimeout": ["1500"],
            "commands": [
                "setpriv --reuid " + shlex.quote(user)
                + " --regid " + shlex.quote(user)
                + " --init-groups bash -c " + shlex.quote(shell)
            ],
        },
    }


def aws(*arguments):
    result = subprocess.run(
        ["aws", "ssm", *arguments, "--output", "json", "--no-cli-pager"],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode:
        # Invocation creation is eventually consistent. Never print remote output/env.
        if "InvocationDoesNotExist" in result.stderr:
            return None
        raise RuntimeError("AWS SSM request failed: " + result.stderr.strip())
    return json.loads(result.stdout)


def safe_remote_output(value):
    """Redact common credentials before exposing a bounded SSM log excerpt."""
    if not value:
        return ""
    value = re.sub(
        r"(?i)(password|passwd|secret|token|access[_-]?key|client[_-]?secret)"
        r"(\s*[:=]\s*)([^\s,;]+)",
        r"\1\2[REDACTED]",
        value,
    )
    value = re.sub(r"\bAKIA[0-9A-Z]{16}\b", "[AWS_ACCESS_KEY_REDACTED]", value)
    value = re.sub(r"(?i)\bBearer\s+\S+", "Bearer [REDACTED]", value)
    value = re.sub(
        r"(?i)postgres(?:ql)?://[^\s'\"]+",
        "postgresql://[REDACTED]",
        value,
    )
    return value[-12000:]


def report_remote_failure(invocation):
    response_code = invocation.get("ResponseCode")
    status_details = invocation.get("StatusDetails")
    print(f"SSM response code: {response_code}", flush=True)
    if status_details:
        print(f"SSM status details: {safe_remote_output(status_details)}", flush=True)
    for label, key in (
        ("stdout", "StandardOutputContent"),
        ("stderr", "StandardErrorContent"),
    ):
        excerpt = safe_remote_output(invocation.get(key, ""))
        if excerpt:
            print(f"Remote {label} (redacted, last 12 KB):\n{excerpt}", flush=True)


def main():
    payload = command_payload()
    response = aws("send-command", "--cli-input-json", json.dumps(payload))
    if response is None:
        raise RuntimeError("SSM did not return a command ID")
    command_id = response["Command"]["CommandId"]
    print(f"SSM command: {command_id}", flush=True)
    deadline = time.monotonic() + 1650
    previous = None
    while time.monotonic() < deadline:
        invocation = aws(
            "get-command-invocation", "--command-id", command_id,
            "--instance-id", payload["InstanceIds"][0],
        )
        status = invocation["Status"] if invocation else "Pending"
        if status != previous:
            print(f"SSM status: {status}", flush=True)
            previous = status
        if status == "Success":
            if invocation["ResponseCode"] != 0:
                raise RuntimeError("SSM returned a nonzero response code")
            print("Remote command completed. See the recorded deployed SHA on EC2.")
            return
        if status not in {"Pending", "InProgress", "Delayed"}:
            report_remote_failure(invocation or {})
            raise RuntimeError(
                f"Deployment {status}; inspect command {command_id} in the AWS SSM console."
            )
        time.sleep(10)
    raise RuntimeError(
        f"Stopped waiting for {command_id}; inspect SSM before retrying. "
        "The remote command may still be running."
    )


if __name__ == "__main__":
    main()
