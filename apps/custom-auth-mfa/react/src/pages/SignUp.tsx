import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signUp } from "aws-amplify/auth";
import { authFlowType, defaultValues, paths } from "../lib";

export default function SignUp() {
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const formData = new FormData(event.target as HTMLFormElement);
      const data = [...formData].reduce((acc, [k, v]) => {
        return { ...acc, [k]: typeof v === "string" ? v : v.name };
      }, {} as Record<string, string>);
      const { username, password, email, phonenumber } = data;
      const { isSignUpComplete, nextStep } = await signUp({
        username,
        password,
        options: {
          userAttributes: {
            email,
            phone_number: phonenumber,
          },
          autoSignIn: { authFlowType },
        },
      }).catch(error => {
        alert(error);
        throw error;
      });
      if (isSignUpComplete) {
        navigate(paths.home);
      } else {
        switch (nextStep.signUpStep) {
          case "CONFIRM_SIGN_UP": {
            navigate(paths.confirmSignup, {
              state: { previous: paths.signup, username },
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
      <h2>Sign Up</h2>
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
        <label className="mb-1 block">
          Email:{" "}
          <input
            name="email"
            type="email"
            required
            defaultValue={defaultValues.email}
          />
        </label>
        <label className="mb-1 block">
          Phone Number:{" "}
          <input
            name="phonenumber"
            type="text"
            required
            defaultValue={defaultValues.phoneNumber}
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
