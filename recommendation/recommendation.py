"""
Offline recommendation engine.

Loads fertilizer, treatment, prevention, and source information
from recommendation/knowledge_base.json.
"""

import json
from pathlib import Path


# ---------------------------------------------------------------------------
# Knowledge base
# ---------------------------------------------------------------------------

KNOWLEDGE_BASE_PATH = (
    Path(__file__).resolve().parent / "knowledge_base.json"
)


with open(
    KNOWLEDGE_BASE_PATH,
    "r",
    encoding="utf-8",
) as file:
    RECOMMENDATIONS = json.load(file)


# ---------------------------------------------------------------------------
# Recommendation function
# ---------------------------------------------------------------------------

def get_recommendation(disease_class):
    """
    Return recommendations for a predicted PlantVillage class.

    Args:
        disease_class (str):
            Original class name returned by the model.

    Returns:
        dict:
            Fertilizer, treatment, prevention, and source information.
    """

    recommendation = RECOMMENDATIONS.get(disease_class)

    if recommendation is None:
        return {
            "crop": "Unknown",
            "disease": disease_class,

            "fertilizer": {
                "recommendation": "Not available",
                "quantity": "Not available",
                "note": (
                    "A recommendation for this class has not "
                    "been added to the knowledge base yet."
                ),
            },

            "treatment": {
                "recommendation": "Not available",
                "note": (
                    "A treatment recommendation for this class "
                    "has not been added yet."
                ),
            },

            "prevention": [],

            "sources": [],
        }

    return recommendation