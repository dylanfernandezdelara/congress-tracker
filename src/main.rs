mod cli;
mod config;
mod models;
mod sources;
mod util;

use anyhow::{Context, Result};
use chrono::NaiveDate;
use clap::{Parser, Subcommand};

use crate::config::Config;
use crate::util::time::{parse_date, today_eastern};

/// CLI tool to track daily US Senate activity for your state senators
#[derive(Parser)]
#[command(name = "daily_senate_update")]
#[command(version, about, long_about = None)]
struct Cli {
    /// Two-letter state code (e.g., CA, NY, TX)
    #[arg(short, long, global = true)]
    state: Option<String>,

    /// Date in YYYY-MM-DD format (defaults to today in Eastern time)
    #[arg(short, long, global = true)]
    date: Option<String>,

    /// Output in JSON format instead of table
    #[arg(short, long, global = true, default_value_t = false)]
    json: bool,

    #[command(subcommand)]
    command: Commands,
}

/// Available subcommands
#[derive(Subcommand)]
enum Commands {
    /// List senators for a state
    Senators,
    /// Show votes for a date, filtered by state senators
    Votes,
    /// Show floor activity for a date
    Floor,
    /// Show all Senate activity for today (votes + floor)
    Today,
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("Error: {}", format_error(&err));
        std::process::exit(1);
    }
}

/// Main application logic with error handling
async fn run() -> Result<()> {
    let cli = Cli::parse();

    // Load configuration
    let config = Config::load().context("Failed to load configuration")?;

    // Parse date if provided, otherwise use today in Eastern time
    let date = match &cli.date {
        Some(date_str) => Some(parse_date(date_str)?),
        None => None,
    };

    // Route to appropriate command handler
    match cli.command {
        Commands::Senators => {
            let state = require_state(&cli.state)?;
            run_senators_command(&config, &state, cli.json).await
        }
        Commands::Votes => {
            let state = require_state(&cli.state)?;
            let date = date.unwrap_or_else(today_eastern);
            run_votes_command(&config, &state, date, cli.json).await
        }
        Commands::Floor => {
            let date = date.unwrap_or_else(today_eastern);
            run_floor_command(&config, date, cli.json).await
        }
        Commands::Today => {
            let state = require_state(&cli.state)?;
            let date = date.unwrap_or_else(today_eastern);
            run_today_command(&config, &state, date, cli.json).await
        }
    }
}

/// Require a state to be provided, returning a validated uppercase state code
fn require_state(state: &Option<String>) -> Result<String> {
    let state = state
        .as_ref()
        .context("State is required for this command. Use --state <STATE_CODE> (e.g., --state CA)")?;

    let state = state.to_uppercase();

    // Validate state code format (2 letters)
    if state.len() != 2 || !state.chars().all(|c| c.is_ascii_alphabetic()) {
        anyhow::bail!(
            "Invalid state code '{}'. Please use a two-letter state code (e.g., CA, NY, TX)",
            state
        );
    }

    Ok(state)
}

/// Format an error chain for user-friendly display
fn format_error(err: &anyhow::Error) -> String {
    let mut msg = err.to_string();

    // Include cause chain for context
    for cause in err.chain().skip(1) {
        msg.push_str(&format!("\n  Caused by: {}", cause));
    }

    msg
}

// Placeholder command handlers - will be implemented in cli submodules
async fn run_senators_command(_config: &Config, state: &str, json: bool) -> Result<()> {
    if json {
        println!("{{\"message\": \"senators command not yet implemented\", \"state\": \"{}\"}}", state);
    } else {
        println!("Senators command not yet implemented for state: {}", state);
    }
    Ok(())
}

async fn run_votes_command(config: &Config, state: &str, date: NaiveDate, json: bool) -> Result<()> {
    cli::run_votes_command(config, state, date, json).await
}

async fn run_floor_command(_config: &Config, date: NaiveDate, json: bool) -> Result<()> {
    if json {
        println!("{{\"message\": \"floor command not yet implemented\", \"date\": \"{}\"}}", date);
    } else {
        println!("Floor command not yet implemented for date: {}", date);
    }
    Ok(())
}

async fn run_today_command(_config: &Config, state: &str, date: NaiveDate, json: bool) -> Result<()> {
    if json {
        println!("{{\"message\": \"today command not yet implemented\", \"state\": \"{}\", \"date\": \"{}\"}}", state, date);
    } else {
        println!("Today command not yet implemented for state: {}, date: {}", state, date);
    }
    Ok(())
}
