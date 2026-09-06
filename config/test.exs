import Config

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :layoutmaster, LayoutMasterWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "UNs6PwRznaf2e8EkzFEqBVkO5aNmaYES8G/pepiGF5XuHlmT6Z8SAlwO3lXnu2lX",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Local storage adapter writes to a throwaway directory during tests
config :layoutmaster, :storage_adapter, LayoutMaster.Storage.Local
config :layoutmaster, :storage_local_root, Path.expand("../tmp/test-data", __DIR__)

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Enable helpful, but potentially expensive runtime checks
config :phoenix_live_view,
  enable_expensive_runtime_checks: true

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
