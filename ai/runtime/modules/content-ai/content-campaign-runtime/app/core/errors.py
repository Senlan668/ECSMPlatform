"""Domain errors shared by runtime services and HTTP adapters."""


class CapabilityUnavailableError(RuntimeError):
    def __init__(self, capability: str, detail: str):
        super().__init__(detail)
        self.capability = capability
        self.detail = detail
