#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: ./scripts/release-tag.sh <版本号|tag>" >&2
  echo "示例: ./scripts/release-tag.sh 0.1.1 或 ./scripts/release-tag.sh v0.1.1" >&2
  exit 1
fi

INPUT_VERSION="$1"
if [[ "$INPUT_VERSION" == v* ]]; then
  TAG="$INPUT_VERSION"
  VERSION="${INPUT_VERSION#v}"
else
  TAG="v$INPUT_VERSION"
  VERSION="$INPUT_VERSION"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 仅阻止已跟踪文件的改动；允许存在未跟踪文件（例如首次新增本脚本）
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "当前有已跟踪文件改动，请先提交或清理后再执行。" >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "本地 tag 已存在: $TAG" >&2
  exit 1
fi

PACKAGE_FILES=()
while IFS= read -r file; do
  PACKAGE_FILES+=("$file")
done < <(find . -name package.json -not -path "*/node_modules/*" -not -path "./.git/*" | sort)
if [[ ${#PACKAGE_FILES[@]} -eq 0 ]]; then
  echo "未找到 package.json 文件。" >&2
  exit 1
fi

for file in "${PACKAGE_FILES[@]}"; do
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const version = process.argv[2];
    const content = fs.readFileSync(file, "utf8");
    const json = JSON.parse(content);
    json.version = version;
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  ' "$file" "$VERSION"
  echo "已更新: $file -> $VERSION"
done

git add "${PACKAGE_FILES[@]}"
git commit -m "chore(release): bump version to $TAG"
git tag "$TAG"
git push origin "$TAG"

echo "发布完成: $TAG"
