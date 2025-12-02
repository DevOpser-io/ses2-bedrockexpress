// AWS Secrets Manager integration using AWS SDK v2
const AWS = require('aws-sdk');
const config = require('../config');

/**
 * Retrieve a secret from AWS Secrets Manager
 * 
 * @param {string} secretName - Name/ARN of the secret
 * @param {string} region - AWS region name
 * @param {string} secretType - Type of secret - 'plain_text' or 'json'
 * @returns {Promise<string|object>} - The secret value as either a string or object
 */
async function getSecret(secretName, region = config.aws.region, secretType = 'plain_text') {
  console.log(`Attempting to retrieve secret: ${secretName} from region: ${region}`);
  
  // Check if this is an email-related secret
  const isEmailSecret = secretName.includes('mail') || secretName.includes('smtp');
  
  try {
    // Create AWS Secrets Manager client using default credentials chain
    // Cross-account role should only be used for Bedrock calls
    console.log('Using default credentials chain for Secrets Manager');
    const clientOptions = { region };
    
    const client = new AWS.SecretsManager(clientOptions);

    console.log('AWS Secrets Manager client created, retrieving secret...');
    const response = await client.getSecretValue({ SecretId: secretName }).promise();
    console.log(`Successfully retrieved secret: ${secretName}`);
    
    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} has no value`);
    }
    
    const secret = response.SecretString;
    
    if (secretType.toLowerCase() === 'json') {
      try {
        return JSON.parse(secret);
      } catch (e) {
        console.error(`Failed to parse secret as JSON: ${e}`);
        throw e;
      }
    }
    
    return secret;
  } catch (error) {
    console.error(`Error retrieving secret ${secretName}: ${error.message}`);
    
    // Provide fallback values for email-related secrets
    if (isEmailSecret) {
      const fallbacks = {
        'bedrockflask-mail-server-13jwl6gq': 'smtp.gmail.com',
        'bedrockflask-mail-port-13jwl6gq': '587',
        'bedrockflask-mail-tls-13jwl6gq': 'true',
        'bedrockflask-mail-sender-13jwl6gq': 'bedrock.express.ai@gmail.com',
        'bedrockflask-mail-password-13jwl6gq': 'app-password-here' // Replace with actual app password if available
      };
      
      if (fallbacks[secretName]) {
        console.log(`Using fallback value for email secret: ${secretName}`);
        return fallbacks[secretName];
      }
    }
    
    throw error;
  }
}

/**
 * Retrieve additional secrets from ADDITIONAL_SECRETS environment variable
 * Expected format: JSON string containing key-value pairs, or plain string
 * 
 * @returns {object|string} - Parsed additional secrets object or plain string
 * @throws {Error} - If ADDITIONAL_SECRETS environment variable is not set
 */
async function getAdditionalSecrets() {
  const additionalSecretsEnv = process.env.ADDITIONAL_SECRETS;
  
  if (!additionalSecretsEnv) {
    throw new Error('ADDITIONAL_SECRETS environment variable is not set');
  }
  
  // Try multiple parsing approaches
  let secret = additionalSecretsEnv.trim();
  
  // First try to parse as JSON directly
  try {
    return JSON.parse(secret);
  } catch (jsonError) {
    console.log(`ADDITIONAL_SECRETS direct JSON parse failed: ${jsonError.message}`);
  }
  
  // If it looks like it might be a secret name, try to retrieve it from AWS Secrets Manager
  if (secret.length < 100 && !secret.includes('{') && !secret.includes('"')) {
    try {
      console.log(`Treating ADDITIONAL_SECRETS as secret name: ${secret}`);
      const secretValue = await getSecret(secret, config.aws.region, 'json');
      if (typeof secretValue === 'object') {
        return secretValue;
      }
      // If it's a string, try to parse it as JSON
      if (typeof secretValue === 'string') {
        try {
          return JSON.parse(secretValue);
        } catch (parseError) {
          console.log(`Failed to parse retrieved secret as JSON: ${parseError.message}`);
        }
      }
    } catch (secretError) {
      console.log(`Failed to retrieve as AWS secret: ${secretError.message}`);
    }
  }
  
  // Try to fix common JSON formatting issues
  try {
    // Remove any escape characters and quotes around the entire string
    let cleaned = secret.replace(/^["']|["']$/g, '');
    // Try to unescape if it's double-escaped
    if (cleaned.includes('\\"')) {
      cleaned = cleaned.replace(/\\"/g, '"');
    }
    return JSON.parse(cleaned);
  } catch (cleanError) {
    console.log(`Cleaned JSON parse failed: ${cleanError.message}`);
  }
  
  console.log(`ADDITIONAL_SECRETS is not valid JSON, treating as plain string. Length: ${secret.length}`);
  // If all parsing attempts fail, return as plain string
  return secret;
}

module.exports = {
  getSecret,
  getAdditionalSecrets
};
