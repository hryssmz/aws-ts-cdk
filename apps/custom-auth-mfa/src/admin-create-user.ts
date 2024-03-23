import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

interface AdminCreateUserEvent {
  username: string;
  email: string;
  phoneNumber: string;
  mfa: "SMS" | "TOTP" | "EMAIL";
}

export const handler = async (event: AdminCreateUserEvent) => {
  const { username, email, phoneNumber, mfa } = event;
  if (["SMS", "TOTP", "EMAIL"].indexOf(mfa) < 0) {
    throw new Error(`Invalid mfa: ${mfa}`);
  }
  const userPoolId = process.env.USER_POOL_ID;
  const client = new CognitoIdentityProviderClient();
  const command = new AdminCreateUserCommand({
    Username: username,
    TemporaryPassword: "password2",
    UserPoolId: userPoolId,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "custom:mfa", Value: mfa },
      { Name: "phone_number", Value: phoneNumber },
    ],
    DesiredDeliveryMediums: ["EMAIL"],
  });
  const result = await client.send(command);
  return result;
};
