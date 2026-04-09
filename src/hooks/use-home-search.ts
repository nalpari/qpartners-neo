import { useState } from "react";
import { useRouter } from "next/navigation";

export function useHomeSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/contents?keyword=${encodeURIComponent(query.trim())}`);
    }
  };

  return { query, setQuery, handleSearch };
}
