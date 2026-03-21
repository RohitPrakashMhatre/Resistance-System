from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.generate_plot import plot_router
from app.api.ui_state import ui_state_router
from app.core.logging import setup_logger
import logging

logger = setup_logger(__name__)

app = FastAPI(title="Resistance Signal Engine API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later restrict
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(plot_router)
app.include_router(ui_state_router)
