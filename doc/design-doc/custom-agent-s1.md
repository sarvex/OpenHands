# Custom Agent Packages with Custom Runtime Images (Scenario 1)

## 1. Introduction

### 1.1 Problem Statement

OpenHands currently supports agent customization through the software-agent-sdk, but users who need custom system dependencies, specialized tools, or non-Python runtime environments cannot easily deploy their agents. The current V1 architecture uses a fixed agent server image (`ghcr.io/openhands/agent-server:5f62cee-python`) that may not contain the required dependencies for specialized agents.

Users building agents that require:
- Custom system packages (e.g., specialized compilers, databases, ML frameworks)
- Non-Python tools and runtimes (e.g., Node.js, Go, Rust toolchains)
- Custom Docker base images with specific OS configurations
- Proprietary or licensed software installations

Currently have no supported path to deploy their agents within the OpenHands ecosystem.

### 1.2 Proposed Solution

We propose extending the V1 architecture to support **Custom Agent Runtime Images** - allowing users to package their agents with custom dependencies into Docker images that integrate seamlessly with OpenHands' existing infrastructure.

Users will be able to:
1. Create custom Docker images containing their agent code and dependencies
2. Register these images with OpenHands through a declarative specification
3. Deploy conversations using their custom agent images instead of the default agent server
4. Maintain full compatibility with OpenHands' HTTP API and tooling ecosystem

The solution leverages the existing V1 architecture's separation between the main server and agent server, requiring minimal changes to core OpenHands components while providing maximum flexibility for custom agent deployment.

**Trade-offs**: This approach requires users to build and maintain Docker images, increasing complexity compared to simple Python package deployment. However, it provides the necessary isolation and dependency management for complex agent requirements that cannot be satisfied by dynamic package installation.

## 2. User Interface

### 2.1 Custom Agent Image Creation

Users create a custom agent image by extending the base agent server image:

```dockerfile
# Dockerfile for custom agent
FROM ghcr.io/openhands/agent-server:5f62cee-python

# Install custom system dependencies
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    golang-go \
    && rm -rf /var/lib/apt/lists/*

# Install custom Python packages
COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt

# Copy custom agent code
COPY my_custom_agent/ /app/my_custom_agent/
COPY agent_config.json /app/config/

# Set custom agent as default
ENV CUSTOM_AGENT_MODULE=my_custom_agent
ENV CUSTOM_AGENT_CLASS=MySpecializedAgent
```

### 2.2 Agent Registration

Users register their custom agent image through a configuration file:

```yaml
# custom-agent-spec.yaml
apiVersion: openhands.ai/v1
kind: CustomAgentSpec
metadata:
  name: specialized-ml-agent
  version: "1.0.0"
spec:
  image: "myregistry/specialized-ml-agent:v1.0.0"
  description: "ML agent with TensorFlow and custom data processing tools"
  capabilities:
    - machine_learning
    - data_analysis
    - custom_visualization
  requirements:
    memory: "4Gi"
    cpu: "2"
  environment:
    TENSORFLOW_VERSION: "2.15.0"
    CUSTOM_MODEL_PATH: "/app/models"
  ports:
    - name: agent-server
      port: 8000
    - name: tensorboard
      port: 6006
```

### 2.3 Conversation Creation with Custom Agent

Users can create conversations using their custom agent through the API:

```bash
# Create conversation with custom agent
curl -X POST "https://api.openhands.ai/api/conversations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_spec": "specialized-ml-agent:v1.0.0",
    "initial_message": "Analyze this dataset and create a predictive model",
    "workspace": {
      "type": "local",
      "working_dir": "/workspace/ml-project"
    }
  }'
```

## 3. Other Context

### 3.1 Docker Image Architecture

Custom agent images follow a layered architecture:
- **Base Layer**: OpenHands agent server runtime (`ghcr.io/openhands/agent-server`)
- **Dependencies Layer**: Custom system packages and tools
- **Agent Layer**: Custom agent implementation and configuration
- **Runtime Layer**: Environment variables and startup configuration

### 3.2 Agent Server Integration

The software-agent-sdk provides the foundation for custom agents through:
- **AgentBase**: Abstract base class defining the agent interface
- **Tool System**: Extensible tool registration and execution framework
- **HTTP API**: Standard endpoints for conversation management and agent interaction
- **Event System**: Structured event handling for actions and observations

### 3.3 Container Orchestration

Custom agent images integrate with OpenHands' existing container orchestration:
- **Sandbox Service**: Manages container lifecycle and resource allocation
- **Network Isolation**: Maintains security boundaries between conversations
- **Resource Management**: Enforces memory and CPU limits per agent instance
- **Health Monitoring**: Tracks agent server availability and performance

## 4. Technical Design

### 4.1 Custom Agent Image Specification

#### 4.1.1 Image Structure

Custom agent images must conform to the following structure:

```
/app/
├── config/
│   ├── agent_config.json          # Agent configuration
│   └── tool_registry.json         # Custom tool definitions
├── agents/
│   └── custom_agent.py            # Agent implementation
├── tools/
│   ├── __init__.py
│   └── custom_tools.py            # Custom tool implementations
└── startup/
    └── init_agent.py              # Agent initialization script
```

#### 4.1.2 Agent Configuration Schema

```python
# agent_config.json
{
    "agent": {
        "name": "SpecializedMLAgent",
        "version": "1.0.0",
        "description": "ML agent with TensorFlow capabilities",
        "module": "agents.custom_agent",
        "class": "SpecializedMLAgent"
    },
    "capabilities": [
        "machine_learning",
        "data_analysis",
        "visualization"
    ],
    "tools": [
        {"name": "TerminalTool"},
        {"name": "FileEditorTool"},
        {"name": "TensorFlowTool", "module": "tools.custom_tools"},
        {"name": "DataVisualizationTool", "module": "tools.custom_tools"}
    ],
    "environment": {
        "TENSORFLOW_VERSION": "2.15.0",
        "MODEL_CACHE_DIR": "/app/models"
    }
}
```

### 4.2 Agent Implementation Interface

#### 4.2.1 Custom Agent Base Class

```python
# agents/custom_agent.py
from openhands.sdk.agent.base import AgentBase
from openhands.sdk.llm import LLM
from openhands.sdk.tool import Tool
from typing import List, Dict, Any

class SpecializedMLAgent(AgentBase):
    """Custom ML agent with TensorFlow capabilities."""

    def __init__(
        self,
        llm: LLM,
        tools: List[Tool],
        config: Dict[str, Any] = None
    ):
        super().__init__(llm=llm, tools=tools)
        self.config = config or {}
        self.model_cache = self.config.get('MODEL_CACHE_DIR', '/app/models')

    async def initialize(self) -> None:
        """Initialize custom agent resources."""
        # Load pre-trained models
        await self._load_models()

        # Initialize custom tools
        await self._setup_custom_tools()

    async def _load_models(self) -> None:
        """Load TensorFlow models from cache."""
        import tensorflow as tf
        # Custom model loading logic
        pass

    async def _setup_custom_tools(self) -> None:
        """Initialize custom tools with agent context."""
        # Custom tool setup logic
        pass
```

#### 4.2.2 Custom Tool Implementation

```python
# tools/custom_tools.py
from openhands.sdk.tool import Tool, ToolExecutor, register_tool
from openhands.sdk import Action, Observation
from pydantic import Field
import tensorflow as tf

class TensorFlowAnalysisAction(Action):
    dataset_path: str = Field(description="Path to dataset file")
    model_type: str = Field(description="Type of ML model to create")
    target_column: str = Field(description="Target column for prediction")

class TensorFlowAnalysisObservation(Observation):
    model_accuracy: float = Field(description="Model accuracy score")
    feature_importance: Dict[str, float] = Field(description="Feature importance scores")
    model_path: str = Field(description="Path to saved model")

class TensorFlowToolExecutor(ToolExecutor[TensorFlowAnalysisAction, TensorFlowAnalysisObservation]):
    def __call__(self, action: TensorFlowAnalysisAction, conversation=None) -> TensorFlowAnalysisObservation:
        # Custom TensorFlow analysis logic
        model = self._create_model(action.dataset_path, action.model_type, action.target_column)
        accuracy = self._evaluate_model(model)
        importance = self._get_feature_importance(model)
        model_path = self._save_model(model)

        return TensorFlowAnalysisObservation(
            model_accuracy=accuracy,
            feature_importance=importance,
            model_path=model_path
        )

# Register the custom tool
register_tool(
    Tool(
        name="TensorFlowTool",
        executor=TensorFlowToolExecutor(),
        definition=ToolDefinition(
            name="tensorflow_analysis",
            description="Perform machine learning analysis using TensorFlow",
            parameters=TensorFlowAnalysisAction.model_json_schema()
        )
    )
)
```

### 4.3 Runtime Integration

#### 4.3.1 Custom Agent Loader

```python
# startup/init_agent.py
import json
import importlib
from pathlib import Path
from openhands.sdk.agent.base import AgentBase
from openhands.sdk.llm import LLM
from openhands.sdk.tool import Tool, resolve_tool

class CustomAgentLoader:
    """Loads custom agents from configuration."""

    def __init__(self, config_path: str = "/app/config/agent_config.json"):
        self.config_path = Path(config_path)
        self.config = self._load_config()

    def _load_config(self) -> dict:
        """Load agent configuration from JSON file."""
        with open(self.config_path) as f:
            return json.load(f)

    def create_agent(self, llm: LLM) -> AgentBase:
        """Create custom agent instance."""
        agent_config = self.config["agent"]

        # Import custom agent class
        module = importlib.import_module(agent_config["module"])
        agent_class = getattr(module, agent_config["class"])

        # Load custom tools
        tools = self._load_tools()

        # Create agent instance
        agent = agent_class(
            llm=llm,
            tools=tools,
            config=self.config.get("environment", {})
        )

        return agent

    def _load_tools(self) -> List[Tool]:
        """Load and resolve custom tools."""
        tools = []
        for tool_config in self.config.get("tools", []):
            if "module" in tool_config:
                # Import custom tool module to register it
                importlib.import_module(tool_config["module"])

            tool = resolve_tool(tool_config["name"])
            tools.append(tool)

        return tools
```

#### 4.3.2 Agent Server Startup Integration

```python
# Modified agent server startup in software-agent-sdk
import os
from openhands.agent_server.api import app
from openhands.agent_server.conversation_service import ConversationService
from startup.init_agent import CustomAgentLoader

@app.on_event("startup")
async def startup_event():
    """Initialize custom agent during server startup."""

    # Check for custom agent configuration
    custom_agent_module = os.getenv('CUSTOM_AGENT_MODULE')
    custom_agent_class = os.getenv('CUSTOM_AGENT_CLASS')

    if custom_agent_module and custom_agent_class:
        # Load custom agent
        loader = CustomAgentLoader()
        app.state.agent_factory = loader.create_agent
        print(f"Loaded custom agent: {custom_agent_class}")
    else:
        # Use default agent
        from openhands.sdk.agent import Agent
        app.state.agent_factory = lambda llm: Agent(llm=llm, tools=get_default_tools())
        print("Using default OpenHands agent")
```

### 4.4 Sandbox Service Integration

#### 4.4.1 Custom Agent Spec Model

```python
# openhands/app_server/sandbox/custom_agent_models.py
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

class CustomAgentSpec(BaseModel):
    """Specification for custom agent deployment."""

    name: str = Field(description="Unique name for the custom agent")
    version: str = Field(description="Version of the custom agent")
    image: str = Field(description="Docker image containing the custom agent")
    description: Optional[str] = Field(description="Human-readable description")

    capabilities: List[str] = Field(
        default_factory=list,
        description="List of agent capabilities"
    )

    requirements: Dict[str, str] = Field(
        default_factory=dict,
        description="Resource requirements (memory, cpu)"
    )

    environment: Dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables for the agent"
    )

    ports: List[Dict[str, any]] = Field(
        default_factory=lambda: [{"name": "agent-server", "port": 8000}],
        description="Port configurations"
    )
```

#### 4.4.2 Custom Sandbox Spec Service

```python
# openhands/app_server/sandbox/custom_agent_sandbox_service.py
from openhands.app_server.sandbox.sandbox_spec_service import SandboxSpecService
from openhands.app_server.sandbox.sandbox_spec_models import SandboxSpecInfo
from openhands.app_server.sandbox.custom_agent_models import CustomAgentSpec

class CustomAgentSandboxService(SandboxSpecService):
    """Sandbox service for custom agent deployments."""

    def __init__(self, custom_agent_registry: Dict[str, CustomAgentSpec]):
        self.custom_agent_registry = custom_agent_registry

    def create_custom_agent_sandbox_spec(
        self,
        agent_spec_name: str,
        agent_version: str = "latest"
    ) -> SandboxSpecInfo:
        """Create sandbox specification for custom agent."""

        spec_key = f"{agent_spec_name}:{agent_version}"
        if spec_key not in self.custom_agent_registry:
            raise ValueError(f"Custom agent spec not found: {spec_key}")

        custom_spec = self.custom_agent_registry[spec_key]

        # Build environment variables
        env_vars = {
            'OPENVSCODE_SERVER_ROOT': '/openhands/.openvscode-server',
            'OH_ENABLE_VNC': '0',
            'LOG_JSON': 'true',
            'OH_CONVERSATIONS_PATH': '/workspace/conversations',
            'OH_BASH_EVENTS_DIR': '/workspace/bash_events',
            'PYTHONUNBUFFERED': '1',
            'ENV_LOG_LEVEL': '20',
            # Custom agent environment
            'CUSTOM_AGENT_MODULE': custom_spec.name,
            'CUSTOM_AGENT_CLASS': custom_spec.name,
            **custom_spec.environment
        }

        return SandboxSpecInfo(
            id=custom_spec.image,
            command=['--port', '8000'],
            initial_env=env_vars,
            working_dir='/workspace/project',
            # Resource requirements
            memory_limit=custom_spec.requirements.get('memory', '2Gi'),
            cpu_limit=custom_spec.requirements.get('cpu', '1'),
        )
```

### 4.5 API Integration

#### 4.5.1 Custom Agent Conversation Creation

```python
# openhands/server/routes/custom_agent_routes.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from uuid import UUID

from openhands.app_server.sandbox.custom_agent_sandbox_service import CustomAgentSandboxService
from openhands.server.session.agent_session import AgentSession

router = APIRouter(prefix="/api/custom-agents", tags=["Custom Agents"])

class CreateCustomAgentConversationRequest(BaseModel):
    agent_spec: str  # Format: "agent-name:version"
    initial_message: str
    workspace_config: Optional[Dict[str, Any]] = None

class CreateCustomAgentConversationResponse(BaseModel):
    conversation_id: UUID
    agent_spec: str
    status: str

@router.post("/conversations")
async def create_custom_agent_conversation(
    request: CreateCustomAgentConversationRequest,
    sandbox_service: CustomAgentSandboxService = Depends(get_custom_agent_sandbox_service)
) -> CreateCustomAgentConversationResponse:
    """Create a new conversation with a custom agent."""

    try:
        # Parse agent spec
        agent_name, agent_version = request.agent_spec.split(":", 1)
    except ValueError:
        agent_name = request.agent_spec
        agent_version = "latest"

    # Create custom sandbox specification
    try:
        sandbox_spec = sandbox_service.create_custom_agent_sandbox_spec(
            agent_name, agent_version
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Create sandbox with custom spec
    sandbox = await sandbox_service.create_sandbox(sandbox_spec)

    # Wait for agent server to be ready
    await wait_for_agent_server_ready(sandbox)

    # Create conversation
    conversation = await create_conversation_with_sandbox(
        sandbox=sandbox,
        initial_message=request.initial_message,
        workspace_config=request.workspace_config
    )

    return CreateCustomAgentConversationResponse(
        conversation_id=conversation.id,
        agent_spec=request.agent_spec,
        status="created"
    )
```

## 5. Implementation Plan

All implementation must pass existing lints and tests. New functionality requires comprehensive test coverage including unit tests, integration tests, and end-to-end scenarios.

### 5.1 Foundation Models and Services (M1)

#### 5.1.1 Custom Agent Specification Models

* `openhands/app_server/sandbox/custom_agent_models.py`
* `tests/unit/app_server/sandbox/test_custom_agent_models.py`

Define Pydantic models for custom agent specifications including image references, resource requirements, and environment configuration.

#### 5.1.2 Custom Agent Registry Service

* `openhands/app_server/sandbox/custom_agent_registry.py`
* `tests/unit/app_server/sandbox/test_custom_agent_registry.py`

Implement registry service for managing custom agent specifications with CRUD operations and validation.

### 5.2 Sandbox Integration (M2)

#### 5.2.1 Custom Agent Sandbox Service

* `openhands/app_server/sandbox/custom_agent_sandbox_service.py`
* `tests/unit/app_server/sandbox/test_custom_agent_sandbox_service.py`

Extend sandbox service to support custom agent image deployment with resource management and environment configuration.

#### 5.2.2 Agent Server Startup Integration

* `openhands-agent-server/openhands/agent_server/custom_agent_loader.py`
* `tests/unit/agent_server/test_custom_agent_loader.py`

Implement custom agent loading mechanism in agent server startup process with configuration-driven agent instantiation.

**Demo**: Deploy a simple custom agent with additional Python packages and verify it responds to basic queries through the existing HTTP API.

### 5.3 API Endpoints (M3)

#### 5.3.1 Custom Agent Management API

* `openhands/server/routes/custom_agent_routes.py`
* `tests/unit/server/routes/test_custom_agent_routes.py`

Implement REST API endpoints for custom agent registration, conversation creation, and status management.

#### 5.3.2 Agent Specification Validation

* `openhands/app_server/sandbox/custom_agent_validator.py`
* `tests/unit/app_server/sandbox/test_custom_agent_validator.py`

Add validation logic for custom agent specifications including image accessibility, resource limits, and security constraints.

**Demo**: Create conversations with custom agents through API endpoints and demonstrate tool execution with custom dependencies.

### 5.4 Advanced Features (M4)

#### 5.4.1 Resource Management and Monitoring

* `openhands/app_server/sandbox/custom_agent_monitor.py`
* `tests/unit/app_server/sandbox/test_custom_agent_monitor.py`

Implement resource monitoring and management for custom agent containers including memory/CPU usage tracking and automatic scaling.

#### 5.4.2 Security and Isolation

* `openhands/app_server/security/custom_agent_security.py`
* `tests/unit/app_server/security/test_custom_agent_security.py`

Add security validation for custom agent images including vulnerability scanning integration and network isolation policies.

**Demo**: Deploy multiple custom agents simultaneously with different resource requirements and demonstrate proper isolation and resource management.
