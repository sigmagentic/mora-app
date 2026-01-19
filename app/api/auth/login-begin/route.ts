import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { supabase } from "@/lib/supabase";
import { generateAuthenticationOptionsConfig } from "@/lib/webauthn";
// import { randomBytes } from "crypto";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { uint8ToBase64 } from "@/lib/utils";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const { username, isDevicePRFSupported } = await request.json();

    let allowCredentials: any[] = [];

    /*
    // @TODO, UI allows us to send this in but does not work so commenting out for now
    //... as not sure what the use case is for this yet
    if (username) {
      // Get user's credentials if username provided

      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .single();

      if (user) {
        const { data: credentials } = await supabase
          .from("user_credentials")
          .select("credential_id, transports")
          .eq("user_id", user.id);

        allowCredentials = credentials
          ? credentials.map((cred) => ({
              id: cred.credential_id,
              transports: cred.transports,
            }))
          : [];
      }
    }
    */

    // Generate authentication options
    const options: any = await generateAuthenticationOptions(
      generateAuthenticationOptionsConfig(allowCredentials)
    );

    // const prfSalt = randomBytes(32);
    const prfSalt = crypto.getRandomValues(new Uint8Array(16));
    // const prfSaltBase64 = uint8ToBase64(prfSalt);

    const authOptions: Record<string, any> = {
      authenticationOptions: options, // your existing options
    };

    // if PRF is supported, include PRF salt
    if (isDevicePRFSupported) {
      // this gives a random salt, but we have the UX issue where we can't link it to a user as we dont know user_id
      // const prfSaltBase64URL = isoBase64URL.fromBuffer(prfSalt);

      // but thsi work fine for bext UX and there are no security tradeoffs as the KEK will be (user_passkey_private_key, prf_salt) so it's always safe
      const prfSaltBase64URL = isoBase64URL.fromBuffer(
        new TextEncoder().encode("vault-kek-v1")
      );

      authOptions.prfSaltBase64URL = prfSaltBase64URL;

      console.log(">>> Generated PRF salt (base64url):", prfSaltBase64URL);
    }

    return NextResponse.json(authOptions);
  } catch (error) {
    console.error("Login begin error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
