#!/bin/bash

# Define the log file and environment name
log_file="eb_logs.txt"
env_name="env_name"

# Clear the log file if it exists (overwrite any preexisting content)
> "$log_file"

# Request logs from Elastic Beanstalk environment
aws elasticbeanstalk request-environment-info \
  --environment-name $env_name \
  --info-type tail

# Wait for the logs to be ready (adjust delay as necessary)
sleep 10

# Retrieve the logs (this returns URLs to the log files)
log_urls=$(aws elasticbeanstalk retrieve-environment-info \
  --environment-name $env_name \
  --info-type tail \
  --query "EnvironmentInfo[].Message" \
  --output text)

# Check if log_urls is empty
if [[ -z "$log_urls" ]]; then
  echo "No logs are available at the moment."
  exit 1
fi

# Loop over the URLs and download the logs, appending them to the log file
for url in $log_urls; do
  echo "Downloading logs from: $url"
  curl -s "$url" >> "$log_file"  # Append the log to eb_logs.txt
  echo -e "\n\n--- End of log from $url ---\n\n" >> "$log_file"  # Add a separator for clarity
done

# Check if the log file has content
if [[ ! -s "$log_file" ]]; then
  echo "No log content was downloaded. Logs may not be available yet."
  exit 1
fi

# Display the last 100 lines of the combined log file
echo "Last 100 lines of the combined log file ($log_file):"
tail -n 100 "$log_file"
