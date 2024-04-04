import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

interface AdminCreateUserEvent {
  username: string;
  email: string;
  phoneNumber?: string;
  mfa: "SMS" | "TOTP" | "EMAIL" | "OFF";
}

export const handler = async (event: AdminCreateUserEvent) => {
  const { username, email, phoneNumber, mfa } = event;
  if (["SMS", "TOTP", "EMAIL", "OFF"].indexOf(mfa) < 0) {
    throw new Error(`Invalid mfa: ${mfa}`);
  }
  const userPoolId = process.env.USER_POOL_ID;
  const client = new CognitoIdentityProviderClient();
  const adminDeleteUserCommand = new AdminDeleteUserCommand({
    Username: username,
    UserPoolId: userPoolId,
  });
  await client.send(adminDeleteUserCommand).catch(() => {});
  const adminCreateUserCommand = new AdminCreateUserCommand({
    Username: username,
    TemporaryPassword: "P@ssw0rd2",
    UserPoolId: userPoolId,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "custom:mfa", Value: mfa },
      ...(phoneNumber ? [{ Name: "phone_number", Value: phoneNumber }] : []),
    ],
    DesiredDeliveryMediums: ["EMAIL"],
  });
  const result = await client.send(adminCreateUserCommand);
  return result;
};
