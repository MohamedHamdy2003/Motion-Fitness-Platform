import base64
import importlib.util
from pathlib import Path
import shlex
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "send_ssm", Path(__file__).with_name("send-ssm.py")
)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

ENV = {
    "GITHUB_SHA": "a" * 40,
    "EC2_INSTANCE_ID": "i-04f68383f87a22a33",
    "EC2_USER": "ec2-user",
    "EC2_PROJECT_PATH": "/home/ec2-user/Motion-Fitness-Platform",
}


class DeploymentTest(unittest.TestCase):
    @patch.dict("os.environ", ENV)
    def test_payload_runs_exact_script_as_app_user(self):
        payload = deploy.command_payload()
        command = shlex.split(payload["Parameters"]["commands"][0])
        self.assertEqual(command[:7], ["setpriv", "--reuid", "ec2-user", "--regid", "ec2-user", "--init-groups", "bash"])
        self.assertEqual(command[7], "-c")
        encoded = command[8].split("printf %s ", 1)[1].split(" |", 1)[0]
        self.assertEqual(
            base64.b64decode(encoded),
            Path(__file__).with_name("update-aws.sh").read_bytes(),
        )
        self.assertIn("bash -s -- " + ENV["GITHUB_SHA"], command[8])
        self.assertEqual(payload["InstanceIds"], [ENV["EC2_INSTANCE_ID"]])

    @patch.dict("os.environ", {**ENV, "EC2_PROJECT_PATH": "/tmp/x;id"})
    def test_rejects_shell_metacharacters(self):
        with self.assertRaises(ValueError):
            deploy.command_payload()

    @patch.dict("os.environ", ENV)
    @patch.object(deploy.time, "sleep")
    def test_waits_for_success_after_eventual_consistency(self, sleep):
        replies = [
            {"Command": {"CommandId": "test-id"}}, None,
            {"Status": "InProgress"}, {"Status": "Success", "ResponseCode": 0},
        ]
        with patch.object(deploy, "aws", side_effect=replies) as aws:
            deploy.main()
        self.assertEqual(aws.call_count, 4)
        self.assertEqual(sleep.call_count, 2)

    @patch.dict("os.environ", ENV)
    def test_remote_failure_fails_job(self):
        with patch.object(deploy, "aws", side_effect=[
            {"Command": {"CommandId": "test-id"}}, {"Status": "Failed"},
        ]):
            with self.assertRaisesRegex(RuntimeError, "Deployment Failed"):
                deploy.main()


if __name__ == "__main__":
    unittest.main()
