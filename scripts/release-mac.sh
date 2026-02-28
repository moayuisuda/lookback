#!/usr/bin/env bash
# Mac 本地构建 + 公证 + 上传 GitHub Release 脚本
# 用法: ./scripts/release-mac.sh <版本tag>  例如: ./scripts/release-mac.sh v0.1.26
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: ./scripts/release-mac.sh <版本tag>" >&2
  exit 1
fi
TAG="$1"

# ── 依赖检查 ──────────────────────────────────────────────────────────────────
command -v gh >/dev/null 2>&1 || { echo "需要安装 GitHub CLI: brew install gh" >&2; exit 1; }
command -v xcrun >/dev/null 2>&1 || { echo "需要 Xcode Command Line Tools" >&2; exit 1; }

# ── 环境变量（优先读取 .env.local，也可直接 export 后执行）──────────────────
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

: "${APPLE_ID:?请设置 APPLE_ID 环境变量（或写入 .env.local）}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?请设置 APPLE_APP_SPECIFIC_PASSWORD 环境变量}"
: "${APPLE_TEAM_ID:?请设置 APPLE_TEAM_ID 环境变量}"
# 明确指定 Keychain 中的 Developer ID Application 证书（避免 electron-builder 找不到或选错）
# 若使用 .p12 文件，改为设置 CSC_LINK=<路径> 和 CSC_KEY_PASSWORD=<密码>
CSC_NAME="Haohui An (7Q2D6L77XF)"
export APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID CSC_NAME

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
cd "$APP_DIR"

# ── 步骤 1: 清理旧产物 + 构建（签名，不公证）────────────────────────────────
# 先删旧 zip/dmg，防止多版本文件导致后续步骤提交错误产物
rm -f dist/*.zip dist/*.dmg dist/*.blockmap dist/latest-mac.yml
echo "▶ 构建 macOS 应用 (证书: ${CSC_NAME})..."
npm run build:mac -- --publish never

# ── 步骤 2: 公证 ─────────────────────────────────────────────────────────────
# 从 package.json 读版本号精确定位产物（彻底避免多版本文件混淆）
VERSION=$(node -p "require('./package.json').version")
ZIP_FILE="dist/LookBack-${VERSION}-arm64-mac.zip"
DMG_FILE="dist/LookBack-${VERSION}-arm64.dmg"
echo "▶ 提交公证: $ZIP_FILE"

RESULT=$(xcrun notarytool submit "$ZIP_FILE" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait \
  --output-format json)
echo "$RESULT"

SUBMISSION_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")

# 打印 Apple 日志（无论成功失败）
if [[ -n "$SUBMISSION_ID" ]]; then
  echo "▶ Apple 公证日志:"
  xcrun notarytool log "$SUBMISSION_ID" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" || true
fi

if [[ "$STATUS" != "Accepted" ]]; then
  echo "✗ 公证失败，状态: $STATUS" >&2
  exit 1
fi

# ── 步骤 3: Staple ────────────────────────────────────────────────────────────
echo "▶ Stapling: $DMG_FILE"
xcrun stapler staple "$DMG_FILE"

# ── 步骤 4: 上传到 GitHub Release ─────────────────────────────────────────────
echo "▶ 上传 Mac 产物到 GitHub Release $TAG ..."
gh release upload "$TAG" \
  dist/*.dmg \
  dist/*.dmg.blockmap \
  dist/*-mac.zip \
  dist/latest-mac.yml \
  --repo moayuisuda/lookback-release \
  --clobber

echo "✓ Mac 发布完成: $TAG"
