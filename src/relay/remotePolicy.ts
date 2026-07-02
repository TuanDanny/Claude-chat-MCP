export function remoteReadLimits() {
  return {
    ok: true,
    max_chars_per_file: 8000,
    max_context_packet_budget: 16000,
    sensitive_files: "requires_reconfirmation",
    write_tools: "disabled_in_v1",
    relay_storage: "no_raw_file_content"
  };
}
