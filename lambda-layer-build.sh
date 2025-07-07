#!/bin/bash

# Lambda Layer Build Script for Serverless Browser Agent
# This script builds a lambda layer with all necessary dependencies for running
# browser-agent in AWS Lambda environment (ARM64)

# Navigate to the layer directory
cd lambda-layers/serverless-browser

# Clean up existing files
rm -rf lib
rm -rf nodejs/node_modules
rm -rf nodejs/package-lock.json
rm -rf chromium
rm -rf tmp

# Create lib directory if it doesn't exist
mkdir -p lib

# Build using Amazon Linux 2023 ARM64 Docker image with all canvas dependencies
# Reference: https://github.com/charoitel/lambda-layer-canvas-nodejs/blob/ac16c9af8eee82fd64e29f8f178debfe78a32026/build-layer.sh
docker run --rm -v $(pwd):/var/task --platform linux/arm64 amazonlinux:2023 bash -c "\
    yum update -y && \
    yum groupinstall 'Development Tools' -y && \
    yum install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel librsvg2-devel pango-devel bzip2-devel python3 -y && \
    # Install Node.js 20
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && \
    yum install -y nodejs && \
    node --version && npm --version && \
    cd /var/task/nodejs && \
    npm init -y && \
    npm install canvas@3.1.0 --build-from-source && \
    echo '=== Copying shared libraries ===' && \
    mkdir -p /var/task/lib && \
    echo 'Copying direct dependencies...' && \
    ldd node_modules/canvas/build/Release/canvas.node | grep '=>' | awk '{print \$3}' | xargs -I{} cp -L {} /var/task/lib/ && \
    echo '=== Testing canvas in container ===' && \
    LD_LIBRARY_PATH=/var/task/lib node -e \"try { const canvas = require('canvas'); console.log('Canvas loaded successfully'); } catch(e) { console.error('Error:', e); }\" && \
    echo '=== Installing Chromium ===' && \
    mkdir -p /tmp/assets && \
    mkdir -p /var/task/tmp/bin && \
    echo 'Downloading Chromium pack...' && \
    curl -SL --retry 5 --retry-delay 10 -o /tmp/assets/chromium-pack.tar https://github.com/Sparticuz/chromium/releases/download/v137.0.0/chromium-v137.0.0-pack.arm64.tar && \
    echo 'Extracting Chromium pack...' && \
    tar -xf /tmp/assets/chromium-pack.tar -C /var/task/tmp/bin/ && \
    if [ -d /var/task/tmp/bin/bin ]; then mv /var/task/tmp/bin/bin/* /var/task/tmp/bin/; rmdir /var/task/tmp/bin/bin; fi && \
    chmod -R a+r /var/task/tmp/bin/* && \
    chmod a+x /var/task/tmp/bin && \
    echo '=== Verifying Chromium setup ===' && \
    ls -lR /var/task/tmp/bin && \
    rm -rf /tmp/assets"

# Set correct permissions
chmod -R 755 nodejs/node_modules
chmod -R 755 lib
chmod -R 755 tmp

echo "=== Layer Build Complete ==="
echo "The layer has been built for AWS Lambda (ARM64) environment."
echo "Do not attempt to test the libraries locally as they are built for Lambda's environment."
echo ""
echo "Next steps:"
echo "1. Zip the contents of this directory to create your Lambda layer"
echo "2. Upload the layer to AWS Lambda"
echo "3. Reference the layer in your Lambda function configuration" 