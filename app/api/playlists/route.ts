import { getSession } from "@/lib/auth";
import { fetchPlaylists } from "@/lib/youtube-service";
import { jsonOk } from "@/lib/result";

const DEFAULT_USER_ID = "default-user";

export async function GET() {
  const session = getSession();
  const userId = session?.userId ?? DEFAULT_USER_ID;
  const data = await fetchPlaylists(userId);
  return jsonOk(data);
}