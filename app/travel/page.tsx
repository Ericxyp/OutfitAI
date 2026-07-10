import { redirect } from "next/navigation";
import { TravelPlannerForm } from "@/components/travel-planner-form";
import { PageHeader } from "@/components/ui/page-states";
import { createClient } from "@/lib/supabase/server";

type TravelPageProps = {
  searchParams: Promise<{
    destination?: string;
    days?: string;
  }>;
};

export default async function TravelPage({ searchParams }: TravelPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/travel");
  }

  const params = await searchParams;
  const initialDestination = params.destination?.trim() ?? "";
  const parsedDays = params.days ? Number(params.days) : undefined;
  const initialDays =
    parsedDays !== undefined &&
    Number.isInteger(parsedDays) &&
    parsedDays >= 1 &&
    parsedDays <= 10
      ? parsedDays
      : 3;

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="旅行穿搭规划"
        subtitle="告诉我目的地和行程，我会结合天气和你的衣橱，规划 Day1-DayN 穿搭与打包清单。"
        backHref="/profile"
        backLabel="返回我的"
      />
      <TravelPlannerForm
        initialDestination={initialDestination}
        initialDays={initialDays}
      />
    </div>
  );
}
