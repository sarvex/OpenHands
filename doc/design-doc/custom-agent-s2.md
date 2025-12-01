# Dynamic Custom Agent Package Loading (Scenario 2)

## 1. Introduction

### 1.1 Problem Statement

OpenHands V1 architecture uses a fixed agent server image (`ghcr.io/openhands/agent-server:5f62cee-python`) that contains the default agent implementation. Users who want to customize agent behavior with pure Python packages that don't require additional system dependencies currently have no supported mechanism to deploy their custom agents without building entirely new Docker images.

This creates unnecessary complexity for the common use case where users simply want to:
- Customize agent prompts and reasoning logic
- Add new Python-based tools and capabilities
- Integrate with Python APIs and libraries already available in the base image
- Deploy agents with different LLM configurations or specialized workflows

The current approach forces all customization through the heavyweight Scenario 1 path (custom Docker images), even when the base agent server image already contains all necessary dependencies.

### 1.2 Proposed Solution

We propose implementing **Dynamic Custom Agent Package Loading** within the existing V1 agent server container. This allows users to deploy custom agents by providing Python packages that are downloaded, installed, and instantiated at runtime without requiring custom Docker images.

Users will be able to:
1. Package their custom agents as standard Python packages (pip-installable)
2. Specify agent package URLs (Git repositories, PyPI packages, or ZIP archives) in conversation creation
3. Have the agent server dynamically download and install the package at startup
4. Instantiate their custom agent within the existing container environment
5. Maintain full compatibility with the existing HTTP API (`/ask_agent` endpoint)

The solution leverages the existing V1 architecture's agent server container but extends the startup process to support dynamic agent loading based on environment configuration.

**Trade-offs**: This approach is limited to Python packages that can run within the existing agent server environment. Users needing custom system dependencies, non-Python tools, or different base images must use Scenario 1. However, this covers the majority of agent customization use cases with significantly reduced complexity.

## 2. User Interface

### 2.1 Custom Agent Package Structure

Users create a standard Python package with the required interface:

```python
# my_custom_agent/
├── setup.py
├── requirements.txt                    # Optional additional dependencies
├── my_custom_agent/
│   ├── __init__.py
│   ├── agent.py                       # Main agent implementation
│   ├── tools.py                       # Custom tools (optional)
│   └── config.py                      # Agent configuration
```

### 2.2 Agent Implementation

```python
# my_custom_agent/agent.py
from openhands.sdk.agent.base import AgentBase
from openhands.sdk.llm import LLM
from openhands.sdk.tool import Tool
from typing import List, Dict, Any

class MyCustomAgent(AgentBase):
    """Custom agent with specialized behavior."""

    def __init__(self, llm: LLM, tools: List[Tool], config: Dict[str, Any] = None):
        super().__init__(llm=llm, tools=tools)
        self.config = config or {}

    async def initialize(self) -> None:
        """Initialize custom agent resources."""
        # Custom initialization logic
        pass

# Factory function for agent creation
def create_agent(llm: LLM, tools: List[Tool], config: Dict[str, Any] = None) -> AgentBase:
    """Factory function to create the custom agent."""
    return MyCustomAgent(llm=llm, tools=tools, config=config)
```

### 2.3 Package Entry Point

```python
# my_custom_agent/__init__.py
from .agent import create_agent, MyCustomAgent

__all__ = ['create_agent', 'MyCustomAgent']
```

### 2.4 Setup Configuration

```python
# setup.py
from setuptools import setup, find_packages

setup(
    name="my-custom-agent",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        # Only additional dependencies beyond base image
        "requests>=2.25.0",
        "beautifulsoup4>=4.9.0",
    ],
    entry_points={
        'openhands.agents': [
            'my_custom_agent = my_custom_agent:create_agent',
        ],
    },
)
```

### 2.5 Conversation Creation with Dynamic Agent Loading

Users create conversations by specifying the agent package URL:

```bash
# Create conversation with custom agent package
curl -X POST "https://api.openhands.ai/api/conversations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_package_url": "git+https://github.com/user/my-custom-agent.git",
    "initial_message": "Help me analyze this codebase",
    "workspace": {
      "type": "local",
      "working_dir": "/workspace/project"
    }
  }'
```

Alternative package sources:
```bash
# PyPI package
"agent_package_url": "my-custom-agent==1.0.0"

# ZIP archive
"agent_package_url": "https://example.com/agents/my-custom-agent.zip"

# Private Git repository
"agent_package_url": "git+https://token@github.com/private/agent.git"
```

## 3. Other Context

### 3.1 V1 Architecture Integration Points

Based on analysis of the OpenHands V1 architecture, the integration points are:

- **Main Server**: `openhands/app_server/sandbox/docker_sandbox_spec_service.py` creates `SandboxSpecInfo` with environment variables
- **Agent Server**: `software-agent-sdk/openhands-agent-server` contains the HTTP API and conversation management
- **HTTP API**: `/api/conversations/{id}/ask_agent` endpoint in `conversation_router.py` routes to agent instances
- **Agent Loading**: Agent server startup process in `conversation_service.py` and `event_service.py`

### 3.2 Software Agent SDK Architecture

From analysis of the `software-agent-sdk` repository:

- **AgentBase**: Abstract base class in `openhands/sdk/agent/base.py` defines the agent interface
- **Tool System**: `openhands/sdk/tool/` provides tool registration and execution framework
- **Conversation Management**: `openhands/sdk/conversation/` handles event streams and state management
- **HTTP Server**: FastAPI application in `openhands/agent_server/api.py` with conversation routes

### 3.3 Dynamic Package Loading Patterns

Python supports several mechanisms for dynamic package loading:
- **pip install**: Direct installation from various sources (Git, PyPI, archives)
- **importlib**: Dynamic module importing and class instantiation
- **entry_points**: Standardized plugin discovery mechanism
- **subprocess**: Secure package installation in isolated environments

## 4. Technical Design

### 4.1 Dynamic Agent Loading Architecture

#### 4.1.1 Agent Package Loader

```python
# openhands/agent_server/dynamic_agent_loader.py
import subprocess
import importlib
import tempfile
import os
import sys
from typing import Dict, Any, Optional
from urllib.parse import urlparse
from pathlib import Path

from openhands.sdk.agent.base import AgentBase
from openhands.sdk.llm import LLM
from openhands.sdk.tool import Tool
from openhands.sdk.logger import get_logger

logger = get_logger(__name__)

class DynamicAgentLoader:
    """Loads custom agents from package URLs at runtime."""

    def __init__(self):
        self.installed_packages: Dict[str, str] = {}

    async def load_agent_from_url(
        self,
        package_url: str,
        llm: LLM,
        tools: list[Tool],
        config: Optional[Dict[str, Any]] = None
    ) -> AgentBase:
        """Load and instantiate agent from package URL."""

        # Check if already installed
        if package_url in self.installed_packages:
            package_name = self.installed_packages[package_url]
            return await self._create_agent_instance(package_name, llm, tools, config)

        # Install the package
        package_name = await self._install_package(package_url)
        self.installed_packages[package_url] = package_name

        # Create agent instance
        return await self._create_agent_instance(package_name, llm, tools, config)

    async def _install_package(self, package_url: str) -> str:
        """Install package from URL and return package name."""

        logger.info(f"Installing custom agent package: {package_url}")

        try:
            # Install package using pip
            result = subprocess.run([
                sys.executable, "-m", "pip", "install", package_url
            ], capture_output=True, text=True, check=True)

            logger.info(f"Package installation successful: {result.stdout}")

            # Extract package name from URL
            package_name = self._extract_package_name(package_url)
            return package_name

        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to install package {package_url}: {e.stderr}")
            raise RuntimeError(f"Package installation failed: {e.stderr}")

    def _extract_package_name(self, package_url: str) -> str:
        """Extract package name from various URL formats."""

        if package_url.startswith('git+'):
            # Git URL: extract repo name
            url = package_url.replace('git+', '')
            return Path(urlparse(url).path).stem
        elif '==' in package_url:
            # PyPI with version: extract package name
            return package_url.split('==')[0]
        elif package_url.endswith('.zip'):
            # ZIP file: extract filename
            return Path(urlparse(package_url).path).stem
        else:
            # Assume it's a simple package name
            return package_url

    async def _create_agent_instance(
        self,
        package_name: str,
        llm: LLM,
        tools: list[Tool],
        config: Optional[Dict[str, Any]] = None
    ) -> AgentBase:
        """Create agent instance from installed package."""

        try:
            # Import the package
            module = importlib.import_module(package_name)

            # Look for create_agent function
            if hasattr(module, 'create_agent'):
                create_agent_func = getattr(module, 'create_agent')
                agent = create_agent_func(llm=llm, tools=tools, config=config)
            else:
                # Fallback: look for agent class
                agent_classes = [
                    attr for attr in dir(module)
                    if (isinstance(getattr(module, attr), type) and
                        issubclass(getattr(module, attr), AgentBase) and
                        getattr(module, attr) != AgentBase)
                ]

                if not agent_classes:
                    raise RuntimeError(f"No agent class found in package {package_name}")

                agent_class = getattr(module, agent_classes[0])
                agent = agent_class(llm=llm, tools=tools, config=config)

            # Initialize the agent
            if hasattr(agent, 'initialize'):
                await agent.initialize()

            logger.info(f"Successfully created agent from package: {package_name}")
            return agent

        except Exception as e:
            logger.error(f"Failed to create agent from package {package_name}: {e}")
            raise RuntimeError(f"Agent instantiation failed: {e}")
```

#### 4.1.2 Agent Server Integration

```python
# Modified openhands/agent_server/conversation_service.py
import os
from typing import Optional
from openhands.agent_server.dynamic_agent_loader import DynamicAgentLoader
from openhands.sdk.agent.base import AgentBase
from openhands.sdk.agent import Agent  # Default agent

class ConversationService:
    """Enhanced conversation service with dynamic agent loading."""

    def __init__(self, config: Config):
        self.config = config
        self.agent_loader = DynamicAgentLoader()
        self._default_agent_factory = None
        self._custom_agent_cache: Dict[str, AgentBase] = {}

    async def _get_or_create_agent(
        self,
        conversation_id: UUID,
        llm: LLM,
        tools: list[Tool]
    ) -> AgentBase:
        """Get or create agent for conversation."""

        # Check for custom agent package URL in environment
        custom_agent_url = os.getenv('CUSTOM_AGENT_PACKAGE_URL')

        if custom_agent_url:
            # Use custom agent
            if custom_agent_url not in self._custom_agent_cache:
                agent = await self.agent_loader.load_agent_from_url(
                    package_url=custom_agent_url,
                    llm=llm,
                    tools=tools,
                    config=self._get_agent_config()
                )
                self._custom_agent_cache[custom_agent_url] = agent

            return self._custom_agent_cache[custom_agent_url]
        else:
            # Use default agent
            if not self._default_agent_factory:
                self._default_agent_factory = Agent(llm=llm, tools=tools)

            return self._default_agent_factory

    def _get_agent_config(self) -> Dict[str, Any]:
        """Extract agent configuration from environment."""
        config = {}

        # Parse JSON config if provided
        config_json = os.getenv('CUSTOM_AGENT_CONFIG')
        if config_json:
            import json
            config.update(json.loads(config_json))

        return config
```

### 4.2 Sandbox Service Integration

#### 4.2.1 Enhanced Sandbox Specification

```python
# openhands/app_server/sandbox/docker_sandbox_spec_service.py
from typing import Optional

class DockerSandboxSpecService(SandboxSpecService):
    """Enhanced sandbox service supporting dynamic agent loading."""

    def create_dynamic_agent_sandbox_spec(
        self,
        agent_package_url: str,
        agent_config: Optional[Dict[str, Any]] = None
    ) -> SandboxSpecInfo:
        """Create sandbox spec with dynamic agent loading configuration."""

        # Base environment from existing implementation
        base_env = {
            'OPENVSCODE_SERVER_ROOT': '/openhands/.openvscode-server',
            'OH_ENABLE_VNC': '0',
            'LOG_JSON': 'true',
            'OH_CONVERSATIONS_PATH': '/workspace/conversations',
            'OH_BASH_EVENTS_DIR': '/workspace/bash_events',
            'PYTHONUNBUFFERED': '1',
            'ENV_LOG_LEVEL': '20',
        }

        # Add dynamic agent configuration
        dynamic_env = {
            **base_env,
            'CUSTOM_AGENT_PACKAGE_URL': agent_package_url,
        }

        # Add agent configuration as JSON if provided
        if agent_config:
            import json
            dynamic_env['CUSTOM_AGENT_CONFIG'] = json.dumps(agent_config)

        return SandboxSpecInfo(
            id=AGENT_SERVER_IMAGE,  # Same base image
            command=['--port', '8000'],
            initial_env=dynamic_env,
            working_dir='/workspace/project',
        )
```

#### 4.2.2 Conversation Creation API Enhancement

```python
# openhands/server/routes/conversation_routes.py
from pydantic import BaseModel
from typing import Optional, Dict, Any

class CreateConversationRequest(BaseModel):
    """Enhanced conversation creation request."""
    initial_message: str
    workspace_config: Optional[Dict[str, Any]] = None
    # New field for dynamic agent loading
    agent_package_url: Optional[str] = None
    agent_config: Optional[Dict[str, Any]] = None

@router.post("/conversations")
async def create_conversation(
    request: CreateConversationRequest,
    sandbox_service: DockerSandboxSpecService = Depends(get_sandbox_service)
) -> ConversationResponse:
    """Create conversation with optional dynamic agent loading."""

    if request.agent_package_url:
        # Create sandbox with dynamic agent loading
        sandbox_spec = sandbox_service.create_dynamic_agent_sandbox_spec(
            agent_package_url=request.agent_package_url,
            agent_config=request.agent_config
        )
    else:
        # Use default sandbox specification
        sandbox_spec = sandbox_service.get_default_sandbox_specs()[0]

    # Create sandbox and conversation
    sandbox = await sandbox_service.create_sandbox(sandbox_spec)
    await wait_for_agent_server_ready(sandbox)

    conversation = await create_conversation_with_sandbox(
        sandbox=sandbox,
        initial_message=request.initial_message,
        workspace_config=request.workspace_config
    )

    return ConversationResponse(
        conversation_id=conversation.id,
        status="created",
        agent_type="custom" if request.agent_package_url else "default"
    )
```

### 4.3 Agent Server Startup Process

#### 4.3.1 Enhanced Agent Server Initialization

```python
# openhands/agent_server/api.py startup modification
import os
from openhands.agent_server.dynamic_agent_loader import DynamicAgentLoader

@app.on_event("startup")
async def startup_event():
    """Enhanced startup with dynamic agent loading support."""

    # Initialize dynamic agent loader
    app.state.agent_loader = DynamicAgentLoader()

    # Check for custom agent package URL
    custom_agent_url = os.getenv('CUSTOM_AGENT_PACKAGE_URL')

    if custom_agent_url:
        logger.info(f"Dynamic agent loading enabled: {custom_agent_url}")
        # Pre-validate package URL (optional)
        try:
            await app.state.agent_loader._install_package(custom_agent_url)
            logger.info("Custom agent package pre-installed successfully")
        except Exception as e:
            logger.warning(f"Custom agent pre-installation failed: {e}")
            # Continue with startup - will retry on first conversation
    else:
        logger.info("Using default agent configuration")
```

### 4.4 Error Handling and Fallback

#### 4.4.1 Robust Error Handling

```python
# openhands/agent_server/dynamic_agent_loader.py (enhanced)
class DynamicAgentLoader:
    """Enhanced loader with comprehensive error handling."""

    async def load_agent_with_fallback(
        self,
        package_url: str,
        llm: LLM,
        tools: list[Tool],
        config: Optional[Dict[str, Any]] = None
    ) -> AgentBase:
        """Load custom agent with fallback to default agent."""

        try:
            return await self.load_agent_from_url(package_url, llm, tools, config)
        except Exception as e:
            logger.error(f"Custom agent loading failed: {e}")
            logger.info("Falling back to default agent")

            # Import default agent
            from openhands.sdk.agent import Agent
            return Agent(llm=llm, tools=tools)

    async def _validate_package_url(self, package_url: str) -> bool:
        """Validate package URL accessibility."""

        try:
            if package_url.startswith('git+'):
                # Validate Git repository access
                import subprocess
                result = subprocess.run([
                    'git', 'ls-remote', package_url.replace('git+', '')
                ], capture_output=True, timeout=30)
                return result.returncode == 0
            elif package_url.startswith('http'):
                # Validate HTTP URL accessibility
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.head(package_url, timeout=30)
                    return response.status_code == 200
            else:
                # Assume PyPI package - always return True
                return True
        except Exception:
            return False
```

### 4.5 Security and Isolation

#### 4.5.1 Package Security Validation

```python
# openhands/agent_server/security/package_validator.py
import re
from typing import List, Set
from urllib.parse import urlparse

class PackageSecurityValidator:
    """Validates custom agent packages for security compliance."""

    ALLOWED_DOMAINS: Set[str] = {
        'github.com',
        'gitlab.com',
        'bitbucket.org',
        'pypi.org',
        'files.pythonhosted.org'
    }

    BLOCKED_PACKAGES: Set[str] = {
        # Add known malicious packages
    }

    def validate_package_url(self, package_url: str) -> bool:
        """Validate package URL against security policies."""

        # Check blocked packages
        if self._is_blocked_package(package_url):
            return False

        # Validate domain for HTTP/Git URLs
        if package_url.startswith(('http', 'git+')):
            parsed = urlparse(package_url.replace('git+', ''))
            if parsed.hostname not in self.ALLOWED_DOMAINS:
                return False

        # Additional security checks
        return self._validate_package_name(package_url)

    def _is_blocked_package(self, package_url: str) -> bool:
        """Check if package is in blocklist."""
        for blocked in self.BLOCKED_PACKAGES:
            if blocked in package_url.lower():
                return True
        return False

    def _validate_package_name(self, package_url: str) -> bool:
        """Validate package name format."""
        # Basic validation for malicious patterns
        malicious_patterns = [
            r'\.\./',  # Path traversal
            r'[;&|`$]',  # Command injection
            r'<script',  # XSS attempts
        ]

        for pattern in malicious_patterns:
            if re.search(pattern, package_url, re.IGNORECASE):
                return False

        return True
```

## 5. Implementation Plan

All implementation must pass existing lints and tests. New functionality requires comprehensive test coverage including unit tests, integration tests, and end-to-end scenarios.

### 5.1 Dynamic Agent Loading Foundation (M1)

#### 5.1.1 Dynamic Agent Loader Implementation

* `openhands/agent_server/dynamic_agent_loader.py`
* `tests/unit/agent_server/test_dynamic_agent_loader.py`

Implement core dynamic agent loading functionality with package installation, module importing, and agent instantiation.

#### 5.1.2 Package Security Validation

* `openhands/agent_server/security/package_validator.py`
* `tests/unit/agent_server/security/test_package_validator.py`

Add security validation for custom agent packages including domain allowlists and malicious pattern detection.

**Demo**: Load a simple custom agent from a Git repository and verify it responds to basic queries through the existing `/ask_agent` HTTP API.

### 5.2 Sandbox Service Integration (M2)

#### 5.2.1 Enhanced Sandbox Specification

* `openhands/app_server/sandbox/docker_sandbox_spec_service.py` (modifications)
* `tests/unit/app_server/sandbox/test_docker_sandbox_spec_service.py` (enhancements)

Extend existing sandbox service to support dynamic agent loading configuration through environment variables.

#### 5.2.2 Agent Server Startup Integration

* `openhands/agent_server/conversation_service.py` (modifications)
* `openhands/agent_server/api.py` (startup enhancements)
* `tests/unit/agent_server/test_conversation_service.py` (enhancements)

Integrate dynamic agent loading into agent server startup and conversation management processes.

**Demo**: Create conversations with custom agents specified via environment variables and demonstrate proper agent instantiation and tool execution.

### 5.3 API Integration (M3)

#### 5.3.1 Enhanced Conversation Creation API

* `openhands/server/routes/conversation_routes.py` (modifications)
* `tests/unit/server/routes/test_conversation_routes.py` (enhancements)

Extend conversation creation API to accept agent package URLs and configuration parameters.

#### 5.3.2 Error Handling and Fallback

* `openhands/agent_server/dynamic_agent_loader.py` (enhancements)
* `tests/unit/agent_server/test_dynamic_agent_fallback.py`

Implement comprehensive error handling with fallback to default agents when custom agent loading fails.

**Demo**: Create conversations through API endpoints with various package URL formats (Git, PyPI, ZIP) and demonstrate proper error handling and fallback behavior.

### 5.4 Advanced Features and Optimization (M4)

#### 5.4.1 Agent Caching and Performance

* `openhands/agent_server/agent_cache.py`
* `tests/unit/agent_server/test_agent_cache.py`

Implement agent instance caching to avoid repeated package installation and improve performance for multiple conversations with the same custom agent.

#### 5.4.2 Package Management and Cleanup

* `openhands/agent_server/package_manager.py`
* `tests/unit/agent_server/test_package_manager.py`

Add package lifecycle management including cleanup of unused packages and version management for package updates.

**Demo**: Deploy multiple conversations with different custom agents simultaneously and demonstrate proper resource management, caching, and cleanup behavior.

---

## References

This design document is based on analysis of the following source materials:

1. **OpenHands V1 Architecture**: Analysis of `openhands/app_server/sandbox/docker_sandbox_spec_service.py` and `openhands/app_server/event_callback/github_v1_callback_processor.py` for understanding the V1 flow and agent server integration.

2. **Software Agent SDK**: Analysis of the `software-agent-sdk` repository, specifically:
   - `openhands-agent-server/openhands/agent_server/conversation_router.py` for HTTP API patterns
   - `openhands-sdk/openhands/sdk/agent/base.py` for agent interface requirements
   - `examples/01_standalone_sdk/02_custom_tools.py` for custom agent implementation patterns

3. **Agent Server Models**: Analysis of `openhands.agent_server.models` imports in the main OpenHands codebase for understanding the API contract between main server and agent server.

4. **Container Architecture**: Analysis of `AGENT_SERVER_IMAGE` constant usage in `openhands/app_server/sandbox/sandbox_spec_service.py` for understanding the current container deployment model.

All technical specifications and implementation details are derived from examination of the existing codebase and established patterns within the OpenHands ecosystem.
