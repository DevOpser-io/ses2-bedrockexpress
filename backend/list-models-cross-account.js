const { BedrockClient, ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

async function listModelsInCrossAccount() {
  const roleArn = 'arn:aws:iam::767828725284:role/CrossAccountBedrockRole';
  const region = 'us-east-1';

  try {
    console.log('=== Listing Models with Cross-Account Role ===\n');

    // Step 1: Check current identity
    const stsClient = new STSClient({ region });
    const currentIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    console.log('Current Identity:', {
      Account: currentIdentity.Account,
      Arn: currentIdentity.Arn
    });

    // Step 2: Assume the cross-account role
    console.log('\nAssuming role:', roleArn);
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'ListModelsSession',
      DurationSeconds: 3600
    });

    const assumedRole = await stsClient.send(assumeRoleCommand);
    console.log('Successfully assumed role!');

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
    console.log('\nUsing Assumed Role Identity:', {
      Account: assumedIdentity.Account,
      Arn: assumedIdentity.Arn
    });

    // Step 4: Create Bedrock client with assumed role credentials
    console.log('\nCreating Bedrock client with assumed role credentials...');
    const bedrockClient = new BedrockClient({
      region,
      credentials: {
        accessKeyId: assumedRole.Credentials.AccessKeyId,
        secretAccessKey: assumedRole.Credentials.SecretAccessKey,
        sessionToken: assumedRole.Credentials.SessionToken
      }
    });

    // Step 5: List foundation models
    console.log('\nListing available Claude models in account', assumedIdentity.Account, '...\n');
    const listCommand = new ListFoundationModelsCommand({});
    const response = await bedrockClient.send(listCommand);

    // Filter and display Claude models
    const claudeModels = response.modelSummaries.filter(model =>
      model.modelId.toLowerCase().includes('claude')
    );

    if (claudeModels.length === 0) {
      console.log('No Claude models found in the cross-account!');
    } else {
      console.log('Available Claude models:');
      claudeModels.forEach(model => {
        console.log(`  - ${model.modelId}`);
        console.log(`    Name: ${model.modelName}`);
        console.log(`    Provider: ${model.providerName}`);
        console.log(`    Input Modalities: ${model.inputModalities?.join(', ') || 'N/A'}`);
        console.log(`    Output Modalities: ${model.outputModalities?.join(', ') || 'N/A'}`);
        console.log('');
      });
    }

    // Also list ALL models (not just Claude)
    console.log(`\nTotal models available: ${response.modelSummaries.length}`);
    console.log('\nAll available model IDs:');
    response.modelSummaries.forEach(model => {
      console.log(`  - ${model.modelId} (${model.providerName})`);
    });

  } catch (error) {
    console.error('\nError:', error.message);
    if (error.$metadata) {
      console.error('AWS Error Details:', {
        httpStatusCode: error.$metadata.httpStatusCode,
        requestId: error.$metadata.requestId,
        errorCode: error.name
      });
    }
  }
}

// Run the listing
listModelsInCrossAccount();