#!/usr/bin/env bash
# Invoked as ec2-user through SSM by CI; parameters are validated before use.
set -Eeuo pipefail
revision=${1:?Expected commit SHA}
checkout=${2:?Absolute checkout path}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$checkout" =~ ^/[a-zA-Z0-9_./-]+$ ]] || exit 1
cd "$checkout"
mkdir -p .local
exec 8>.local/aws-update.lock
flock -n 8 || { echo 'Another update is active'; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked server edits must be committed or moved before deployment'; exit 1; }
git fetch https://github.com/MohamedHamdy2003/Motion-Fitness-Platform.git main
latest=$(git rev-parse FETCH_HEAD)
if [[ "$latest" != "$revision" ]]; then
  echo 'Skipping outdated deployment: main has advanced.'
  exit 0
fi
git checkout --detach "$revision"
bash deployment/deploy-aws.sh "$revision"
