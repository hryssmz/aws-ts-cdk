import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
} from "aws-lambda";

export const handler = async (
  event: CdkCustomResourceEvent
): Promise<CdkCustomResourceResponse> => {
  console.log(JSON.stringify(event, null, 2));
  const client = new S3Client();
  const { ResourceProperties } = event;
  const { Bucket, Key, Body, ContentType, Base64 } = ResourceProperties;
  if (event.RequestType === "Create" || event.RequestType === "Update") {
    const command = new PutObjectCommand({
      Bucket,
      Key,
      Body: Base64 ? Buffer.from(Body, "base64") : Body,
      ContentType,
    });
    await client.send(command);
    return {
      PhysicalResourceId: `s3://${Bucket}/${Key}`,
      Data: { Bucket, Key },
    };
  } else {
    const command = new DeleteObjectCommand({ Bucket, Key });
    await client.send(command);
    return {};
  }
};
