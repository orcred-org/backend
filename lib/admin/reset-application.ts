import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { isMissingWorkflowColumn } from "@/lib/workflow";

export type ResetStep = "payment" | "assignment" | "score" | "credential" | "full";

async function updateApplication(
  supabase: SupabaseClient,
  applicationId: string,
  payload: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from("applications").update(payload).eq("id", applicationId);

  if (error && isMissingWorkflowColumn(error.message) && "workflow_stage" in payload) {
    const { workflow_stage: _omit, ...rest } = payload;
    if (Object.keys(rest).length === 0) {
      return { error: null };
    }
    const retry = await supabase.from("applications").update(rest).eq("id", applicationId);
    return { error: retry.error };
  }

  return { error };
}

async function deleteCredentialChain(supabase: SupabaseClient, applicationId: string) {
  const { data: cred } = await supabase
    .from("credentials")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (!cred) return;

  await supabase.from("placement_tracking").delete().eq("credential_id", cred.id);
  await supabase.from("credentials").delete().eq("id", cred.id);
}

export async function resetApplicationStep(applicationId: string, step: ResetStep) {
  const supabase = createServiceClient();

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr) {
    console.error("[admin/reset]", appErr.message);
    return { ok: false as const, status: 500, error: appErr.message };
  }

  if (!app) {
    return { ok: false as const, status: 404, error: "Application not found" };
  }

  const undone: string[] = [];

  if (step === "full" || step === "credential") {
    await deleteCredentialChain(supabase, applicationId);
    undone.push("credential");
  }

  if (step === "full" || step === "score") {
    const { error } = await supabase.from("scores").delete().eq("application_id", applicationId);
    if (error) console.warn("[admin/reset] scores:", error.message);
    undone.push("score");
  }

  if (step === "full" || step === "assignment") {
    const taskDel = await supabase.from("reviewer_tasks").delete().eq("application_id", applicationId);
    if (taskDel.error && !taskDel.error.message.includes("does not exist")) {
      console.warn("[admin/reset] reviewer_tasks:", taskDel.error.message);
    }

    const assignDel = await supabase.from("reviewer_assignments").delete().eq("application_id", applicationId);
    if (assignDel.error) {
      console.error("[admin/reset] reviewer_assignments:", assignDel.error.message);
      return { ok: false as const, status: 500, error: assignDel.error.message };
    }

    await updateApplication(supabase, applicationId, { workflow_stage: null });
    undone.push("assignment");
  }

  if (step === "full" || step === "payment") {
    const { error } = await updateApplication(supabase, applicationId, {
      status: "submitted",
      payment_at: null,
      utr_number: null,
      payment_screenshot_url: null,
      recording_url: null,
      recording_delete_at: null,
      workflow_stage: null,
    });

    if (error) {
      console.error("[admin/reset] payment:", error.message);
      return { ok: false as const, status: 500, error: error.message };
    }
    undone.push("payment");
  } else {
    let newStatus = app.status;

    if (step === "credential" || step === "score") {
      const { data: assignment } = await supabase
        .from("reviewer_assignments")
        .select("id")
        .eq("application_id", applicationId)
        .maybeSingle();
      newStatus = assignment ? "scheduled" : "payment_confirmed";
    } else if (step === "assignment") {
      newStatus = "payment_confirmed";
    }

    if (newStatus !== app.status) {
      await supabase.from("applications").update({ status: newStatus }).eq("id", applicationId);
    }
  }

  return {
    ok: true as const,
    data: { application_id: applicationId, undone, step },
  };
}
