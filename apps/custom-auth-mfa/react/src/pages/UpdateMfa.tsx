import { useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchUserAttributes,
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
import type { MfaType } from "../lib";

export default function UpdateMfa() {
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mfa, setMfa] = useState("");
  const [uri, setUri] = useState("");
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useLayoutEffect(() => {
    setFetching(true);
    fetchUserAttributes()
      .then(userAttributes => {
        setMfa(userAttributes["custom:mfa"] ?? "OFF");
      })
      .finally(() => {
        setFetching(false);
      });
  }, [setFetching, setMfa]);

  const options: { label: string; value: MfaType }[] = [
    { label: "SMS", value: "SMS" },
    { label: "Token Device", value: "TOTP" },
    { label: "Email", value: "EMAIL" },
    { label: "Off", value: "OFF" },
  ] as const;

  async function handleShowQrCode() {
    const { getSetupUri } = await setUpTOTP();
    setUri(getSetupUri("testApp").toString());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
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
        sms: mfa === "SMS" ? "PREFERRED" : "DISABLED",
        totp: mfa === "TOTP" ? "PREFERRED" : "DISABLED",
      }).catch(error => {
        alert(error);
        throw error;
      });
      await updateUserAttribute({
        userAttribute: { attributeKey: "custom:mfa", value: mfa },
      });
      alert("MFA updated!");
      await signOut();
      dispatch(setUser(undefined));
      navigate(paths.signin);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2>Update MFA</h2>
      {fetching ? (
        <div>Loading...</div>
      ) : (
        <form onSubmit={handleSubmit} autoComplete="off">
          {options.map(({ label, value }) => (
            <label key={value} className="mb-1 block">
              <input
                type="radio"
                required
                value={value}
                checked={value === mfa}
                onChange={() => {
                  setMfa(value);
                }}
              />{" "}
              {label}
            </label>
          ))}
          <div className="mb-1">
            <button type="submit" disabled={submitting} className="mr-1">
              {submitting ? "Submitting..." : "Submit"}
            </button>
            {mfa === "TOTP" && (
              <button type="button" onClick={handleShowQrCode}>
                Show QR Code
              </button>
            )}
          </div>
          {uri && (
            <>
              <label className="mb-1 block">
                TOTP code: <input name="code" type="text" required />
              </label>
              <QRCode value={uri} size={256} className="block" />
            </>
          )}
        </form>
      )}
    </div>
  );
}
