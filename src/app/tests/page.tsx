"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface Test {
  id: number;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

async function fetchTests(): Promise<Test[]> {
  const res = await fetch("/api/tests");
  return res.json();
}

export default function TestsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: tests, isLoading } = useQuery({
    queryKey: ["tests"],
    queryFn: fetchTests,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: content || null }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests"] });
      setTitle("");
      setContent("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, content: editContent || null }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/tests/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests"] });
    },
  });

  function startEdit(test: Test) {
    setEditingId(test.id);
    setEditTitle(test.title);
    setEditContent(test.content ?? "");
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-bold">Test CRUD</h1>

      {/* Create Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="mb-8 flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <textarea
          placeholder="Content (optional)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </button>
      </form>

      {/* List */}
      {isLoading ? (
        <p className="text-zinc-500">Loading...</p>
      ) : tests?.length === 0 ? (
        <p className="text-zinc-500">No items yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tests?.map((test) => (
            <li
              key={test.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              {editingId === test.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={2}
                    className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMutation.mutate(test.id)}
                      disabled={updateMutation.isPending}
                      className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="font-semibold">{test.title}</h2>
                    <span className="text-xs text-zinc-400">
                      #{test.id}
                    </span>
                  </div>
                  {test.content && (
                    <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {test.content}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(test)}
                      className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(test.id)}
                      disabled={deleteMutation.isPending}
                      className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
