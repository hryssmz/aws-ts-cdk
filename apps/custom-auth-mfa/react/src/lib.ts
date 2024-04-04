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
  confirmSignin: "/confirm-signin",
  confirmSignup: "/confirm-signup",
  signin: "/signin",
  signout: "/signout",
  signup: "/signup",
  updateMfa: "/update-mfa",
} as const;

export const defaultValues = {
  username: "hryssmz",
  password: "P@ssw0rd",
  email: "hryssmz@yahoo.com",
  phoneNumber: "+817083714064",
} as const;

export type AuthFlowType =
  | "USER_SRP_AUTH"
  | "CUSTOM_WITH_SRP"
  | "CUSTOM_WITHOUT_SRP"
  | "USER_PASSWORD_AUTH";

export type MfaType = "SMS" | "TOTP" | "EMAIL" | "OFF";
