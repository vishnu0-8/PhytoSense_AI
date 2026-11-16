import os

from groq import Groq
from dotenv import load_dotenv

from database.history import (
    create_conversation,
    save_chat_message,
    get_chat_messages,
    get_conversation,
    update_conversation_language,
)


# --------------------------------------------------
# Configuration
# --------------------------------------------------

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

MODEL_NAME = "openai/gpt-oss-120b"


# --------------------------------------------------
# Supported Languages
# --------------------------------------------------

SUPPORTED_LANGUAGES = [
    "English",
    "Hindi",
    "Hinglish",
    "Bhojpuri",
    "Bengali",
    "Marathi",
    "Punjabi",
    "Tamil",
    "Telugu",
]


# --------------------------------------------------
# Plant Disease AI Agent
# --------------------------------------------------

class PlantDiseaseAgent:

    def __init__(
        self,
        crop,
        disease,
        confidence,
        language="English",
        conversation_id=None,
        user_id=None,
    ):

        if not GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY not found in .env file."
            )

        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Unsupported language: {language}"
            )

        self.client = Groq(
            api_key=GROQ_API_KEY
        )

        self.crop = crop
        self.disease = disease
        self.confidence = confidence
        self.language = language

        self.conversation_id = conversation_id
        self.user_id = user_id

        self.messages = []

        self.system_prompt = self.create_system_prompt()

        self.messages.append({
            "role": "system",
            "content": self.system_prompt
        })

    # --------------------------------------------------
    # System Prompt
    # --------------------------------------------------

    def create_system_prompt(self):

        return f"""
You are an intelligent agricultural assistant
specializing in plant diseases.

You help farmers understand plant diseases,
symptoms, treatment and prevention.

CURRENT PLANT INFORMATION:

Crop: {self.crop}
Predicted Disease: {self.disease}
Model Confidence: {self.confidence}%

SELECTED LANGUAGE: {self.language}

LANGUAGE INSTRUCTIONS:

You MUST communicate in {self.language}.

Language requirements:

1. English:
   Use simple English.

2. Hindi:
   Use natural Hindi written in Devanagari script.

3. Hinglish:
   Use natural Hindi-English mixed language.
   Write Hindi mainly in Roman script.

4. Bhojpuri:
   Use simple, natural Bhojpuri.
   Avoid unnecessarily formal Hindi.

5. Bengali:
   Use natural Bengali script.

6. Marathi:
   Use natural Marathi script.

7. Punjabi:
   Use natural Punjabi, preferably Gurmukhi script.

8. Tamil:
   Use natural Tamil script.

9. Telugu:
   Use natural Telugu script.

GENERAL RESPONSIBILITIES:

1. Explain the predicted plant disease.
2. Ask relevant questions about plant symptoms.
3. Ask only ONE follow-up question at a time.
4. Understand the farmer's previous answers.
5. Explain possible causes.
6. Suggest practical treatment methods.
7. Explain prevention techniques.
8. Help farmers care for affected plants.

IMPORTANT RULES:

- Use simple, farmer-friendly language.
- Maintain conversation context.
- Do not repeat questions already answered.
- Ask relevant questions based on previous answers.
- Do not claim that the AI prediction is a confirmed diagnosis.
- Explain that similar symptoms may have different causes.
- Never invent pesticide dosages.
- Recommend following local agricultural guidance
  and product labels.
- Do not invent scientific facts.
- If uncertain, communicate that uncertainty.
- Keep responses understandable and practical.

CONVERSATION BEHAVIOUR:

- Ask one useful question at a time.
- Understand the user's response before asking another.
- Do not ask unnecessary questions.
- Give direct answers when the farmer asks for advice.
- Continue using the selected language.
"""

    # --------------------------------------------------
    # Create New Conversation
    # --------------------------------------------------

    def start_conversation(self):

        self.conversation_id = create_conversation(
            crop=self.crop,
            disease=self.disease,
            confidence=self.confidence,
            language=self.language,
            user_id=self.user_id,
        )

        initial_message = (
            f"My plant has been identified as having "
            f"{self.disease}. Please explain this disease "
            f"and ask me one relevant follow-up question."
        )

        return self.ask(initial_message)

    # --------------------------------------------------
    # Generate AI Response
    # --------------------------------------------------

    def generate_response(self):

        try:

            response = self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=self.messages,
                temperature=0.6,
                max_completion_tokens=800,
            )

            return response.choices[0].message.content

        except Exception as error:

            print("\nGroq API Error:", error)

            return (
                "Sorry, I am temporarily unable to respond. "
                "Please try again."
            )

    # --------------------------------------------------
    # Ask Question
    # --------------------------------------------------

    def ask(self, user_question):

        if not self.conversation_id:
            raise ValueError(
                "Start a conversation before asking questions."
            )

        self.messages.append({
            "role": "user",
            "content": user_question
        })

        save_chat_message(
            conversation_id=self.conversation_id,
            role="user",
            message=user_question,
        )

        ai_response = self.generate_response()

        self.messages.append({
            "role": "assistant",
            "content": ai_response
        })

        save_chat_message(
            conversation_id=self.conversation_id,
            role="assistant",
            message=ai_response,
        )

        return ai_response

    # --------------------------------------------------
    # Change Language
    # --------------------------------------------------

    def change_language(self, new_language):

        if new_language not in SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Unsupported language: {new_language}"
            )

        self.language = new_language

        # Update the system instructions
        self.system_prompt = self.create_system_prompt()

        self.messages[0] = {
            "role": "system",
            "content": self.system_prompt
        }

        # Update database
        update_conversation_language(
            self.conversation_id,
            new_language,
        )

        # Preserve previous conversation
        return self.ask(
            f"""
Please continue our existing conversation in {new_language}.
Preserve all previous context and do not restart the diagnosis.
Briefly acknowledge the language change and ask the next
relevant question only if necessary.
"""
        )

    # --------------------------------------------------
    # Resume Previous Conversation
    # --------------------------------------------------

    @classmethod
    def resume_conversation(cls, conversation_id, user_id=None):

        details = get_conversation(
            conversation_id, user_id=user_id
        )

        if not details:
            raise ValueError(
                "Conversation not found."
            )

        agent = cls(
            crop=details["crop"],
            disease=details["disease"],
            confidence=details["confidence"],
            language=details["language"],
            conversation_id=conversation_id,
            user_id=user_id,
        )

        saved_messages = get_chat_messages(
            conversation_id
        )

        for message in saved_messages:

            agent.messages.append({
                "role": message["role"],
                "content": message["message"],
            })

        return agent

    # --------------------------------------------------
    # Start Fresh Conversation
    # --------------------------------------------------

    def new_conversation(self):

        return self.start_conversation()


# --------------------------------------------------
# Standalone Testing
# --------------------------------------------------

if __name__ == "__main__":

    print("\n🌱 PLANT DISEASE AI AGENT")
    print("=" * 50)

    print("Provider: Groq")
    print("Model:", MODEL_NAME)

    print("\nSupported Languages:")

    for index, language in enumerate(
        SUPPORTED_LANGUAGES,
        start=1
    ):

        print(f"{index}. {language}")

    try:

        language_choice = int(
            input("\nSelect language (1-9): ")
        )

        language = SUPPORTED_LANGUAGES[
            language_choice - 1
        ]

    except (ValueError, IndexError):

        print("Invalid selection. Using English.")

        language = "English"

    # Example prediction
    crop = "Tomato"
    disease = "Tomato Early Blight"
    confidence = 98.5

    agent = PlantDiseaseAgent(
        crop=crop,
        disease=disease,
        confidence=confidence,
        language=language,
    )

    print("\nStarting new conversation...")

    response = agent.start_conversation()

    print("\nAI:", response)

    print("\nCommands:")
    print("exit       - Exit")
    print("reset      - Start a new conversation")
    print("language   - Change language")

    while True:

        user_input = input("\nYou: ").strip()

        if user_input.lower() == "exit":

            print("\nThank you for using Plant Disease AI!")

            break

        elif user_input.lower() == "reset":

            response = agent.new_conversation()

            print("\nNew conversation started.")

            print("\nAI:", response)

        elif user_input.lower() == "language":

            for index, lang in enumerate(
                SUPPORTED_LANGUAGES,
                start=1
            ):

                print(f"{index}. {lang}")

            try:

                choice = int(
                    input("Select language (1-9): ")
                )

                new_language = SUPPORTED_LANGUAGES[
                    choice - 1
                ]

                response = agent.change_language(
                    new_language
                )

                print("\nAI:", response)

            except (ValueError, IndexError):

                print("Invalid language selection.")

        elif not user_input:

            print("Please enter a question.")

        else:

            response = agent.ask(
                user_input
            )

            print("\nAI:", response)