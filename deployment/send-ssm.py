"""Send the tested deployment script to one EC2 instance and await its result."""

import base64
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time


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
    # Run Command starts as root. Git/Docker and files must remain owned by ec2-user.
    shell = (
        "set -Eeuo pipefail; "
        f"printf %s {shlex.quote(encoded)} | base64 --decode | "
        f"bash -s -- {shlex.quote(revision)} {shlex.quote(checkout)}"
    )
    return {
        "InstanceIds": [instance],
        "DocumentName": "AWS-RunShellScript",
        "Comment": f"Motion main {revision}",
        "TimeoutSeconds": 120,
        "Parameters": {
            "executionTimeout": ["1500"],
            "commands": [
                "runuser -u " + shlex.quote(user) + " -- bash -c " + shlex.quote(shell)
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
