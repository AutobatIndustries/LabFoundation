import { LambdaClient, ListTagsCommand, TagResourceCommand, ListFunctionsCommand, UntagResourceCommand } from "@aws-sdk/client-lambda";
import { fromSSO } from "@aws-sdk/credential-providers";
import AwsXRay from "aws-xray-sdk";

let lambdaClient;

async function init() {
  if (lambdaClient) return; // Only initialize once

  lambdaClient = process.env.AWS_EXECUTION_ENV
    ? AwsXRay.captureAWSv3Client(new LambdaClient({}))
    : new LambdaClient({
      credentials: await fromSSO({ profile: "ABL.Sandbox-Administrator" })()
    });
}

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
      tagsToAdd.InspectorCodeExclusion = 'LambdaCodeScanning';
    }
    else {
      if (tagsResponse.Tags?.InspectorCodeExclusion) {
        tagsToRemove.push('InspectorCodeExclusion');
      }
    }

    // Handle standard scanning tag
    if (!standardScanning) {
      tagsToAdd.InspectorExclusion = 'LambdaStandardScanning';
    }
    else {
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

export const handler = async (event) => {
  try {
    await init();

    console.log('Received event:', JSON.stringify(event, null, 2));

    if (event.detail?.LambdaCodeScanning === null || event.detail?.LambdaStandardScanning === null) {
      throw new Error('Missing required scanning configuration in event detail');
    }

    // Extract scanning settings from the EventBridge event
    const codeScanning = event.detail?.LambdaCodeScanning;
    const standardScanning = event.detail?.LambdaStandardScanning;

    // Get all Lambda functions in the account
    const lambdaFunctions = await getAllLambdaFunctions();
    console.log(`Found ${lambdaFunctions.length} Lambda functions`);

    // Update tags for all Lambda functions
    const results = await Promise.all(
      lambdaFunctions.map(func => updateLambdaTags(func.FunctionArn, codeScanning, standardScanning))
    );

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