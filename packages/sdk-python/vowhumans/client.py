from __future__ import annotations
import json
from urllib.request import Request, urlopen

class VowHumansClient:
    """Small server-side standard-library client; raw service keys never enter browser code."""
    def __init__(self, base_url: str, api_key: str, organisation_id: str):
        self.base_url=base_url.rstrip("/"); self.api_key=api_key; self.organisation_id=organisation_id
    def _request(self,path:str,method:str="GET",body:dict|None=None):
        data=json.dumps(body).encode() if body is not None else None
        request=Request(f"{self.base_url}/api/v1{path}",data=data,method=method,headers={"content-type":"application/json","x-api-key":self.api_key,"x-organisation-id":self.organisation_id})
        with urlopen(request,timeout=20) as response: return json.loads(response.read())
    def create_presenter_project(self, **values): return self._request("/presenter-projects","POST",values)
    def usage(self): return self._request("/usage")

