/**
 * AWS Inspector Suppressor
 * 
 * This Lambda function manages AWS Inspector scanning tags for Lambda functions in an AWS account.
 * It can enable or disable both code scanning and standard scanning for all Lambda functions
 * based on configuration provided in an EventBridge event.
 * 
 * The function applies or removes the following tags:
 * - InspectorCodeExclusion: Disables Lambda code scanning when set to 'LambdaCodeScanning'
 * - InspectorExclusion: Disables Lambda standard scanning when set to 'LambdaStandardScanning'
 * 
 * Lambda functions with the tag 'InspectorSuppressorExclusion' set to 'true' will be skipped.
 */

import { LambdaClient, ListTagsCommand, TagResourceCommand, ListFunctionsCommand, UntagResourceCommand } from "@aws-sdk/client-lambda";
import { fromSSO } from "@aws-sdk/credential-providers";
import AwsXRay from "aws-xray-sdk";

// Global client to avoid re-initialization on Lambda container reuse
let lambdaClient;

/**
 * Initialize the Lambda client with appropriate credentials
 * Uses AWS X-Ray for tracing in Lambda environment
 * Uses SSO credentials when running locally
 */
async function init() {
  if (lambdaClient) return; // Only initialize once

  lambdaClient = process.env.AWS_EXECUTION_ENV
    ? AwsXRay.captureAWSv3Client(new LambdaClient({}))
    : new LambdaClient({
      credentials: await fromSSO({ profile: "ABL.Sandbox-Administrator" })()
    });
}

/**
 * Update tags for a Lambda function based on scanning configuration
 * 
 * @param {string} functionArn - ARN of the Lambda function to update
 * @param {boolean} codeScanning - Whether code scanning should be enabled
 * @param {boolean} standardScanning - Whether standard scanning should be enabled
 * @returns {Object} Result of the tag update operation
 */
async function updateLambdaTags(functionArn, codeScanning, standardScanning) {
  try {
    // Get existing tags for the Lambda function
    const tagsResponse = await lambdaClient.send(
      new ListTagsCommand({ Resource: functionArn })
    );

    // Check if the function has the exclusion tag
    if (tagsResponse.Tags && tagsResponse.Tags.InspectorSuppressorExclusion === 'true') {
      console.log(`Skipping ${functionArn} - has InspectorSuppressorExclusion tag set to true`);
      return {
        functionArn,
        status: 'skipped',
        reason: 'Has InspectorSuppressorExclusion tag'
      };
    }

    const tagsToAdd = {};
    const tagsToRemove = [];

    // Handle code scanning tag
    if (!codeScanning) {
      // Add exclusion tag to disable code scanning
      tagsToAdd.InspectorCodeExclusion = 'LambdaCodeScanning';
    }
    else {
      // Remove exclusion tag to enable code scanning
      if (tagsResponse.Tags?.InspectorCodeExclusion) {
        tagsToRemove.push('InspectorCodeExclusion');
      }
    }

    // Handle standard scanning tag
    if (!standardScanning) {
      // Add exclusion tag to disable standard scanning
      tagsToAdd.InspectorExclusion = 'LambdaStandardScanning';
    }
    else {
      // Remove exclusion tag to enable standard scanning
      if (tagsResponse.Tags?.InspectorExclusion) {
        tagsToRemove.push('InspectorExclusion');
      }
    }

    // Remove tags if needed
    if (tagsToRemove.length > 0) {
      await lambdaClient.send(
        new UntagResourceCommand({
          Resource: functionArn,
          TagKeys: tagsToRemove
        })
      );
    }

    // Add tags if needed
    if (Object.keys(tagsToAdd).length > 0) {
      await lambdaClient.send(
        new TagResourceCommand({
          Resource: functionArn,
          Tags: tagsToAdd
        })
      );
    }

    return {
      functionArn,
      status: 'updated',
      tagsAdded: tagsToAdd,
      tagsRemoved: tagsToRemove
    };
  } catch (error) {
    console.error(`Error updating tags for ${functionArn}:`, error);
    return {
      functionArn,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Retrieve all Lambda functions in the AWS account
 * Handles pagination to ensure all functions are retrieved
 * 
 * @returns {Array} List of all Lambda functions
 */
async function getAllLambdaFunctions() {
  let functions = [];
  let nextMarker;

  do {
    const command = new ListFunctionsCommand({
      Marker: nextMarker
    });

    const response = await lambdaClient.send(command);
    functions = functions.concat(response.Functions || []);
    nextMarker = response.NextMarker;
  } while (nextMarker);

  return functions;
}

/**
 * Main Lambda handler function
 * 
 * @param {Object} event - EventBridge event containing scanning configuration
 * @returns {Object} Response with status code and results summary
 * 
 * Expected event format:
 * {
 *   "detail": {
 *     "LambdaCodeScanning": true|false,
 *     "LambdaStandardScanning": true|false
 *   }
 * }
 */
export const handler = async (event) => {
  try {
    await init();

    console.log('Received event:', JSON.stringify(event, null, 2));

    // Validate required parameters are present
    if (event.detail?.LambdaCodeScanning === null || event.detail?.LambdaStandardScanning === null) {
      throw new Error('Missing required scanning configuration in event detail');
    }

    // Extract scanning settings from the EventBridge event
    const codeScanning = event.detail?.LambdaCodeScanning;
    const standardScanning = event.detail?.LambdaStandardScanning;

    // Get all Lambda functions in the account
    const lambdaFunctions = await getAllLambdaFunctions();
    console.log(`Found ${lambdaFunctions.length} Lambda functions`);

    // Update tags for all Lambda functions in parallel
    const results = await Promise.all(
      lambdaFunctions.map(func => updateLambdaTags(func.FunctionArn, codeScanning, standardScanning))
    );

    // Generate summary statistics
    const summary = {
      total: results.length,
      updated: results.filter(r => r.status === 'updated').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length
    };

    console.log(JSON.stringify({
      message: 'Lambda tags update completed',
      summary,
      results
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Lambda tags update completed',
        summary,
        results
      })
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing request',
        error: error.message
      })
    };
  }
};
