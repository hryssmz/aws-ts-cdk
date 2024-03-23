import type { ResourcesConfig } from "aws-amplify";

export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: "",
      userPoolClientId: "",
    },
  },
};

export const authFlowType: AuthFlowType = "CUSTOM_WITH_SRP";

export const paths = {
  home: "/",
  signup: "/signup",
  confirmSignup: "/confirm-signup",
  signin: "/signin",
  signout: "/signout",
  confirmSignin: "/confirm-signin",
  mfaSms: "/mfa-sms",
  mfaTotp: "/mfa-totp",
  mfaEmail: "/mfa-email",
};

export const defaultValues = {
  username: "hryssmz",
  password: "password",
  email: "hryssmz@yahoo.com",
  phoneNumber: "+817083714064",
};

export type AuthFlowType =
  | "USER_SRP_AUTH"
  | "CUSTOM_WITH_SRP"
  | "CUSTOM_WITHOUT_SRP"
  | "USER_PASSWORD_AUTH";
