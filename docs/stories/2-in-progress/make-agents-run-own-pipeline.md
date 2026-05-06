I want a separate workflow that is triggered only in branches != main AND when a commit contains "pipeline". This must be triggered by GH agents that are running in the cloud, and they should look at the result of the pipeline and fix it if necessary.

https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents