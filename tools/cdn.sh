#!/bin/sh

# The 'conector' typo is 'correct' by now, because it's already used in deployments
EXTENSION_NAME="auth0-ldap-conector-health-monitor"
JSON_FILE="webtask.json"
S3_PATH="s3://assets.us.auth0.com/extensions/$EXTENSION_NAME/"

# Extract full version with patch version (eg: 2.1.3)
FULL_VERSION=$(jq -r '.version' "$JSON_FILE")
if [ -z "$FULL_VERSION" ] || [ "$FULL_VERSION" = "null" ]; then
  echo "Error: Could not extract version from $JSON_FILE."
  exit 1
fi

echo "Extracted full version: $FULL_VERSION"

# Extract major.minor version without patch version (eg: 2.1)
# Use shell parameter expansion
MAJORMINOR_VERSION_ONLY=${FULL_VERSION%.*}
if [ -z "$MAJORMINOR_VERSION_ONLY" ] || [ "$MAJORMINOR_VERSION_ONLY" = "null" ]; then
  echo "Error: Could not extract major.minor version from $JSON_FILE."
  exit 1
fi

echo "Extracted major.minor version: $MAJORMINOR_VERSION_ONLY"

deploy_bundle() {
  local version_to_deploy="$1"
  local expected_filename="$EXTENSION_NAME-$version_to_deploy.js"
  local expected_path=$S3_PATH$expected_filename

  echo " "
  echo "--- Deploying v$version_to_deploy to $expected_path ---"

  aws s3 cp index.js "$expected_path"
  upload_exit_status=$?
  if [ $upload_exit_status -ne 0 ]; then
    echo "Error: Failed to upload $expected_filename to $expected_path"
    exit 1
  else
    echo "$expected_filename uploaded successfully to $expected_path."
  fi
  echo "--- Finished deployment step for v$version_to_deploy ---"
  echo " "
}

error_if_bundle_exists() {
  local version_to_check="$1"
  local expected_filename="$EXTENSION_NAME-$version_to_check.js"

  echo "Checking for existing bundle: $version_to_check in $S3_PATH"

  aws_output=$(aws s3 ls "$S3_PATH")
  aws_ls_exit_status=$?

  # Check if aws s3 ls command itself failed
  if [ $aws_ls_exit_status -ne 0 ]; then
    echo "Error: 'aws s3 ls $S3_PATH' failed with exit status $aws_ls_exit_status."
    exit 1
  fi

  # Check if the specific file exists
  BUNDLE_EXISTS=$(echo "$aws_output" | grep $expected_filename)
  if [ ! -z "$BUNDLE_EXISTS" ]; then
    echo "Bundle $expected_filename already exists in $S3_PATH. Skipping cdn publish."
    exit 1
  fi
}

# If full version (eg: 2.1.3) exists in CDN already, exit this script and don't upload the major.minor version
error_if_bundle_exists "$FULL_VERSION"

echo "Bundle $FULL_VERSION not found. Proceeding with upload..."
deploy_bundle "$FULL_VERSION"
deploy_bundle "$MAJORMINOR_VERSION_ONLY"

echo "Script finished."
