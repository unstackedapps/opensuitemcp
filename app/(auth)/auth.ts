import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { getNetSuiteAuthUser } from "@/lib/auth/netsuite-login";
import { verifyNetSuiteLoginProof } from "@/lib/auth/netsuite-login-proof";
import { DUMMY_PASSWORD } from "@/lib/constants";
import {
  createGuestUser,
  getUser,
  updateUserLastLogin,
} from "@/lib/db/queries";
import type { OrgRole } from "@/lib/db/schema";
import { getUserOrgContext } from "@/lib/org/queries";
import { authConfig } from "./auth.config";

export type UserType = "guest" | "regular";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
      orgId: string | null;
      role: OrgRole | null;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
    orgId?: string | null;
    role?: OrgRole | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    orgId: string | null;
    role: OrgRole | null;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  logger: {
    error(...args: unknown[]) {
      const message = args.map(String).join(" ");
      if (
        message.includes("JWTSessionError") ||
        message.includes("no matching decryption secret")
      ) {
        return;
      }

      console.error(...args);
    },
  },
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (user.status === "disabled") {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          return null;
        }

        // Update last login timestamp
        await updateUserLastLogin(user.id);

        return { ...user, type: "regular" };
      },
    }),
    Credentials({
      id: "guest",
      credentials: {},
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: "guest" };
      },
    }),
    Credentials({
      id: "netsuite-oauth",
      credentials: {},
      async authorize({ proof }: any) {
        if (!proof) {
          return null;
        }

        const verified = verifyNetSuiteLoginProof(proof);
        if (!verified) {
          return null;
        }

        const user = await getNetSuiteAuthUser(verified.userId);
        if (!user) {
          return null;
        }

        return { ...user, type: "regular" as const };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id as string;
        token.type = user.type;
      }

      const userId = typeof token.id === "string" ? token.id : undefined;
      if (userId && (user?.id || !("orgId" in token))) {
        const orgContext = await getUserOrgContext(userId);
        token.orgId = orgContext?.orgId ?? null;
        token.role = orgContext?.role ?? null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
        session.user.orgId = token.orgId ?? null;
        session.user.role = token.role ?? null;
      }

      return session;
    },
  },
});
