import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn } from "aws-amplify/auth";
import { authFlowType, defaultValues, paths } from "../lib";
import { useDispatch } from "../store";
import { getCurrentUser } from "../store/auth";

export default function SignIn() {
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const formData = new FormData(event.target as HTMLFormElement);
      const data = [...formData].reduce((acc, [k, v]) => {
        return { ...acc, [k]: typeof v === "string" ? v : v.name };
      }, {} as Record<string, string>);
      const { username, password } = data;
      const { isSignedIn, nextStep } = await signIn({
        username,
        password,
        options: { authFlowType },
      }).catch(error => {
        alert(error);
        throw error;
      });
      if (isSignedIn) {
        await dispatch(getCurrentUser()).unwrap();
        navigate(paths.home);
      } else {
        switch (nextStep.signInStep) {
          case "CONFIRM_SIGN_UP": {
            navigate(paths.confirmSignup, {
              state: { previous: paths.signin, username },
            });
            break;
          }
          case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED":
          case "CONFIRM_SIGN_IN_WITH_SMS_CODE":
          case "CONFIRM_SIGN_IN_WITH_TOTP_CODE":
          case "CONTINUE_SIGN_IN_WITH_MFA_SELECTION": {
            navigate(paths.confirmSignin, {
              state: { signInStep: nextStep.signInStep },
            });
            break;
          }
          case "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE": {
            navigate(paths.confirmSignin, {
              state: {
                signInStep: nextStep.signInStep,
                additionalInfo: nextStep.additionalInfo,
              },
            });
            break;
          }
          case "CONTINUE_SIGN_IN_WITH_TOTP_SETUP": {
            const setupUri = nextStep.totpSetupDetails
              .getSetupUri("testApp")
              .toString();
            navigate(paths.confirmSignin, {
              state: { signInStep: nextStep.signInStep, setupUri },
            });
            break;
          }
          default: {
            alert(JSON.stringify(nextStep, null, 2));
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2>Sign In</h2>
      <form onSubmit={handleSubmit} autoComplete="off">
        <label className="mb-1 block">
          Username:{" "}
          <input
            name="username"
            type="text"
            required
            defaultValue={defaultValues.username}
          />
        </label>
        <label className="mb-1 block">
          Password:{" "}
          <input
            name="password"
            type="text"
            required
            defaultValue={defaultValues.password}
          />
        </label>
        <div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
