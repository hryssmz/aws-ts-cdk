import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  setUpTOTP,
  signOut,
  updateMFAPreference,
  updateUserAttribute,
  verifyTOTPSetup,
} from "aws-amplify/auth";
import QRCode from "react-qr-code";
import { paths } from "../lib";
import { useDispatch } from "../store";
import { setUser } from "../store/auth";

export default function MfaTotp() {
  const [uri, setUri] = useState("");
  const navigate = useNavigate();
  const dispatch = useDispatch();

  return (
    <div>
      <h2>MFA TOTP</h2>
      <form
        onSubmit={async event => {
          event.preventDefault();
          const formData = new FormData(event.target as HTMLFormElement);
          const data = [...formData].reduce((acc, [k, v]) => {
            return { ...acc, [k]: typeof v === "string" ? v : v.name };
          }, {} as Record<string, string>);
          const { code } = data;
          if (code) {
            await verifyTOTPSetup({ code }).catch(error => {
              alert(error);
              throw error;
            });
          }
          await updateMFAPreference({
            sms: "DISABLED",
            totp: "PREFERRED",
          }).catch(error => {
            alert(error);
            throw error;
          });
          await updateUserAttribute({
            userAttribute: { attributeKey: "custom:mfa", value: "TOTP" },
          });
          await signOut();
          dispatch(setUser(undefined));
          navigate(paths.signin);
        }}
      >
        <div className="mb-1">
          <button type="submit" className="mr-1">
            Submit
          </button>
          <button
            type="button"
            onClick={async () => {
              const { username } = await getCurrentUser();
              const { getSetupUri } = await setUpTOTP();
              setUri(getSetupUri("testApp", username).toString());
            }}
          >
            Show QR Code
          </button>
        </div>
        {uri && (
          <>
            <div className="mb-2">
              <label htmlFor="setup-totp-code">TOTP code: </label>
              <input id="setup-totp-code" name="code" type="text" required />
            </div>
            <div>
              <QRCode value={uri} size={256} />
            </div>
          </>
        )}
      </form>
    </div>
  );
}
