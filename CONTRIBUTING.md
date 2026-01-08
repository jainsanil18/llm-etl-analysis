# Contributing to LLM Data Extraction & Clustering

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/llm-data-extraction-clustering.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes
6. Commit with clear messages
7. Push to your fork and create a Pull Request

## Development Setup

1. Install dependencies:
   ```bash
   cd llm-etl-analysis
   npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your OpenAI API key
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Code Style

- Use TypeScript for all code
- Follow existing code style and patterns
- Add JSDoc comments for public functions
- Use meaningful variable and function names
- Keep functions focused and single-purpose

## Pull Request Process

1. Update documentation if needed
2. Add tests if applicable
3. Ensure all scripts run without errors
4. Update CHANGELOG.md if applicable
5. Request review from maintainers

## Areas for Contribution

- Improving extraction accuracy
- Adding support for new data sources
- Enhancing clustering algorithms
- Documentation improvements
- Bug fixes
- Performance optimizations

## Questions?

Open an issue for questions or discussions about contributions.

