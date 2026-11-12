import {
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";

import {
  EXAMPLES_QUERY_KEY,
  type ExampleCatalog,
  type ExampleModel,
  type ExampleQuestion,
} from "@/entities/example";
import { requestJson } from "@/shared/api/request-json";

/**
 * Generates an example's lesson with one model on demand (about two minutes). Several
 * models can run at once; `pending` lists the ones still working.
 */
export function useGenerateExample(questionId: string) {
  const queryClient = useQueryClient();
  const mutationKey = ["generate-example", questionId];

  const mutation = useMutation({
    mutationKey,
    mutationFn: (model: ExampleModel) =>
      requestJson<ExampleQuestion>(`/api/examples/${questionId}/generate`, {
        method: "POST",
        body: JSON.stringify({ model }),
        // The server answers once the lesson is made (about two minutes).
        timeoutMs: GENERATE_TIMEOUT_MS,
      }),
    onSuccess: (question) => {
      queryClient.setQueryData<ExampleCatalog>(EXAMPLES_QUERY_KEY, (catalog) =>
        catalog
          ? {
              questions: catalog.questions.map((q) =>
                q.id === question.id ? question : q,
              ),
            }
          : catalog,
      );
    },
  });

  const pending = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (m) => m.state.variables as ExampleModel,
  });

  return { generate: mutation.mutate, pending, error: mutation.error };
}

// ── Constants ────────────────────────────────────────────────────────────────

const GENERATE_TIMEOUT_MS = 10 * 60_000;
