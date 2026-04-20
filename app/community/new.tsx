import { Redirect } from 'expo-router';

/** 예전 경로 호환: `/community/new` → `/write` */
export default function CommunityNewPostRedirect() {
  return <Redirect href="/write" />;
}
