import { redirect } from "next/navigation";
import { PersonalProfileForm } from "@/components/personal-profile-form";
import { PageHeader } from "@/components/ui/page-states";
import { getUserPersonalProfile } from "@/lib/memory/personal-profile";
import { createClient } from "@/lib/supabase/server";

export default async function PersonalProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/personal");
  }

  const personalProfile = await getUserPersonalProfile(user.id);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="个人信息"
        subtitle="填写基础身体信息与穿衣目标，我会据此给出更贴合你的搭配建议。"
        backHref="/profile"
        backLabel="返回我的"
      />
      <PersonalProfileForm initialProfile={personalProfile} />
    </div>
  );
}
