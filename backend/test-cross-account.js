const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

async function testCrossAccountBedrock() {
  const roleArn = 'arn:aws:iam::767828725284:role/CrossAccountBedrockRole';
  const region = 'us-east-1';

  try {
    console.log('=== Testing Cross-Account Bedrock Access ===\n');

    // Step 1: Check current identity
    const stsClient = new STSClient({ region });
    const currentIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    console.log('Current Identity:', {
      Account: currentIdentity.Account,
      Arn: currentIdentity.Arn
    });

    // Step 2: Assume the cross-account role
    console.log('\nAttempting to assume role:', roleArn);
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'TestBedrockSession',
      DurationSeconds: 3600
    });

    const assumedRole = await stsClient.send(assumeRoleCommand);
    console.log('Successfully assumed role!');
    console.log('Temporary credentials obtained:', {
      AccessKeyId: assumedRole.Credentials.AccessKeyId.substring(0, 10) + '...',
      Expiration: assumedRole.Credentials.Expiration
    });

    // Step 3: Verify the assumed role identity
    const stsAssumed = new STSClient({
      region,
      credentials: {
        accessKeyId: assumedRole.Credentials.AccessKeyId,
        secretAccessKey: assumedRole.Credentials.SecretAccessKey,
        sessionToken: assumedRole.Credentials.SessionToken
      }
    });

    const assumedIdentity = await stsAssumed.send(new GetCallerIdentityCommand({}));
    console.log('\nAssumed Role Identity:', {
      Account: assumedIdentity.Account,
      Arn: assumedIdentity.Arn
    });

    // Step 4: Create Bedrock client with assumed role credentials
    console.log('\nCreating Bedrock client with assumed role credentials...');
    const bedrockClient = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: assumedRole.Credentials.AccessKeyId,
        secretAccessKey: assumedRole.Credentials.SecretAccessKey,
        sessionToken: assumedRole.Credentials.SessionToken
      }
    });

    // Step 5: Test with different model IDs (including inference profiles)
    const modelsToTest = [
      'us.anthropic.claude-opus-4-1-20250805-v1:0',  // Cross-region inference profile
      'us.anthropic.claude-3-5-sonnet-20241022-v2:0', // Try this too if it exists
      'anthropic.claude-opus-4-1-20250805-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0'
    ];

    console.log('\nTesting model invocations...\n');

    for (const modelId of modelsToTest) {
      try {
        console.log(`Testing model: ${modelId}`);

        const requestBody = {
          anthropic_version: 'bedrock-2023-05-31',
          messages: [{
            role: 'user',
            content: [{
              type: 'text',
              text: 'Say "Hello" in one word'
            }]
          }],
          max_tokens: 10,
          temperature: 0
        };

        const command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(requestBody)
        });

        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8'));
        console.log(`✅ SUCCESS with ${modelId}`);
        console.log(`   Response:`, responseBody.content?.[0]?.text || 'No text in response');
        break; // Stop after first success

      } catch (error) {
        console.log(`❌ FAILED with ${modelId}`);
        console.log(`   Error:`, error.message);
      }
    }

  } catch (error) {
    console.error('Error in test:', error.message);
    if (error.$metadata) {
      console.error('AWS Error Details:', {
        httpStatusCode: error.$metadata.httpStatusCode,
        requestId: error.$metadata.requestId
      });
    }
  }
}

// Run the test
testCrossAccountBedrock();