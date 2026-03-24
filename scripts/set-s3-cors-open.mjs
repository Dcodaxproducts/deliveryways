import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_BUCKET_NAME;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!region || !bucket || !accessKeyId || !secretAccessKey) {
  console.error(
    'Missing AWS configuration. Required: AWS_REGION, AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY',
  );
  process.exit(1);
}

const client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const corsConfiguration = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
      AllowedOrigins: ['*'],
      ExposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-id-2'],
      MaxAgeSeconds: 3000,
    },
  ],
};

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: corsConfiguration,
  }),
);

const result = await client.send(
  new GetBucketCorsCommand({
    Bucket: bucket,
  }),
);

console.log(
  JSON.stringify(
    {
      bucket,
      region,
      cors: result.CORSRules ?? [],
    },
    null,
    2,
  ),
);
