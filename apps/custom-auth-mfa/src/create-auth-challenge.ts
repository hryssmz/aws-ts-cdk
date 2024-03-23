import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { CreateAuthChallengeTriggerEvent } from "aws-lambda";

export const handler = async (event: CreateAuthChallengeTriggerEvent) => {
  console.log(JSON.stringify(event, null, 2));
  const { request, response } = event;
  const { session, userAttributes } = request;
  const challengeStep = session.length === 2 ? 2 : -1;

  if (challengeStep === 2) {
    response.publicChallengeParameters = { type: "EMAIL" };
    const verificationCode = "0";
    const senderEmail = process.env.SENDER_EMAIL;
    const recipientEmail = userAttributes.email;
    const client = new SESClient();
    const command = new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: {
          Data: "Email sign in verification",
        },
        Body: {
          Text: {
            Data: `Your verification code is ${verificationCode}`,
          },
        },
      },
    });
    await client.send(command);
    response.privateChallengeParameters = { answer: verificationCode };
  }
  return event;
};
