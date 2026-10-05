import { useRouter } from "expo-router";
import { useCallback } from "react";

import type { AuthResponse } from "@/api/types";
import { useSession } from "@/auth/session";

import { finishSignIn, type SignInOutcome } from "./sign-in";

/**
 * Finish any sign-in answer the same way everywhere:
 * - tokens → the session opens, and the (auth) layout sends the person on;
 * - a shop on a new device → A8 with its challenge;
 * - an admin → returned to the caller, which shows "Admin accounts sign in on the website".
 */
export function useFinishSignIn() {
  const router = useRouter();
  const { completeSignIn } = useSession();

  return useCallback(
    async (response: AuthResponse): Promise<SignInOutcome> => {
      const outcome = await finishSignIn(response, completeSignIn);
      if (outcome.kind === "emailCode") {
        router.push({
          pathname: "/email-code",
          params: { challenge: outcome.challengeToken, hint: outcome.emailHint ?? "" },
        });
      }
      return outcome;
    },
    [completeSignIn, router],
  );
}
