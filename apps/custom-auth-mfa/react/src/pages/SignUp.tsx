import { useNavigate } from "react-router-dom";
import { signUp } from "aws-amplify/auth";
import { authFlowType, defaultValues, paths } from "../lib";

export default function SignUp() {
  const navigate = useNavigate();

  return (
    <div>
      <h2>Sign Up</h2>
      <form
        onSubmit={async event => {
          event.preventDefault();
          const formData = new FormData(event.target as HTMLFormElement);
          const data = [...formData].reduce((acc, [k, v]) => {
            return { ...acc, [k]: typeof v === "string" ? v : v.name };
          }, {} as Record<string, string>);
          const { username, password, email, phonenumber } = data;
          const { isSignUpComplete, nextStep } = await signUp({
            username,
            password,
            options: {
              userAttributes: { email, phone_number: phonenumber },
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
                  state: { previous: "signUp" },
                });
                break;
              }
              default: {
                alert(JSON.stringify(nextStep, null, 2));
              }
            }
          }
        }}
        autoComplete="off"
      >
        <div className="mb-1">
          <label htmlFor="signup-username">Username: </label>
          <input
            id="signup-username"
            name="username"
            type="text"
            required
            defaultValue={defaultValues.username}
          />
        </div>
        <div className="mb-1">
          <label htmlFor="signup-password">Password: </label>
          <input
            id="signup-password"
            name="password"
            type="text"
            required
            defaultValue={defaultValues.password}
          />
        </div>
        <div className="mb-1">
          <label htmlFor="signup-email">Email: </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            required
            defaultValue={defaultValues.email}
          />
        </div>
        <div className="mb-1">
          <label htmlFor="signup-phone-number">Phone Number: </label>
          <input
            id="signup-phone-number"
            name="phonenumber"
            type="text"
            required
            defaultValue={defaultValues.phoneNumber}
          />
        </div>
        <div>
          <button type="submit">Submit</button>
        </div>
      </form>
    </div>
  );
}
