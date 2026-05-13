import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

type TokenRequestBody = {
  teamId?: string;
  channelId?: string;
};

type TeamMembershipRow = {
  role: string;
};

type VoiceChannelRow = {
  id: string;
  team_id: string;
  name: string;
  type: string;
  locked: boolean;
};

type ProfileRow = {
  username: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed."
      },
      405
    );
  }

  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const livekitUrl = getRequiredEnv("LIVEKIT_URL");
    const livekitApiKey = getRequiredEnv("LIVEKIT_API_KEY");
    const livekitApiSecret = getRequiredEnv("LIVEKIT_API_SECRET");

    const authorization = request.headers.get("Authorization") ?? "";

    if (!authorization.startsWith("Bearer ")) {
      return jsonResponse(
        {
          error: "Missing authorization token."
        },
        401
      );
    }

    const jwt = authorization.replace("Bearer ", "").trim();

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization
        }
      }
    });

    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser(jwt);

    if (userError || !user) {
      return jsonResponse(
        {
          error: "Invalid or expired user session."
        },
        401
      );
    }

    const body = (await request.json()) as TokenRequestBody;

    if (!isNonEmptyString(body.teamId) || !isNonEmptyString(body.channelId)) {
      return jsonResponse(
        {
          error: "teamId and channelId are required."
        },
        400
      );
    }

    const teamId = body.teamId.trim();
    const channelId = body.channelId.trim();

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: membershipData, error: membershipError } = await adminClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return jsonResponse(
        {
          error: membershipError.message
        },
        500
      );
    }

    const membership = membershipData as TeamMembershipRow | null;

    if (!membership) {
      return jsonResponse(
        {
          error: "You are not a member of this team."
        },
        403
      );
    }

    const { data: channelData, error: channelError } = await adminClient
      .from("channels")
      .select("id, team_id, name, type, locked")
      .eq("id", channelId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (channelError) {
      return jsonResponse(
        {
          error: channelError.message
        },
        500
      );
    }

    const channel = channelData as VoiceChannelRow | null;

    if (!channel) {
      return jsonResponse(
        {
          error: "Voice channel was not found."
        },
        404
      );
    }

    if (channel.type !== "voice") {
      return jsonResponse(
        {
          error: "Selected channel is not a voice channel."
        },
        400
      );
    }

    if (
      channel.locked &&
      membership.role !== "owner" &&
      membership.role !== "admin"
    ) {
      return jsonResponse(
        {
          error: "This voice channel is locked."
        },
        403
      );
    }

    const { data: profileData } = await adminClient
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const profile = profileData as ProfileRow | null;

    const participantName =
      profile?.username ?? user.email ?? `VoiceClub-${user.id.slice(0, 8)}`;

    const roomName = `voiceclub-${teamId}-${channelId}`;

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: participantName,
      ttl: 60 * 60 * 2
    });

    accessToken.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await accessToken.toJwt();

    return jsonResponse({
      url: livekitUrl,
      token,
      roomName,
      participantName
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create LiveKit token.";

    return jsonResponse(
      {
        error: message
      },
      500
    );
  }
});