import torch
from PIL import Image

import config
from model import build_model
from gradcam.gradcam import GradCAM, preprocess_image, overlay_heatmap


CHECKPOINT = config.CHECKPOINT_DIR / "best_model.pth"

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


# Load checkpoint
ckpt = torch.load(
    CHECKPOINT,
    map_location=DEVICE,
    weights_only=True,
)

arch = ckpt.get("arch", "resnet18")
num_classes = ckpt.get(
    "num_classes",
    config.NUM_CLASSES
)

class_names = ckpt.get("class_names")


# Build model
model = build_model(
    arch=arch,
    num_classes=num_classes,
    pretrained=False,
)

model.load_state_dict(
    ckpt["model_state_dict"]
)

model.to(DEVICE)
model.eval()


# ResNet18 target layer
target_layer = model.layer4[-1]

# Create Grad-CAM
gradcam = GradCAM(
    model=model,
    target_layer=target_layer,
)


# Put your test image here
IMAGE_PATH = "test_leaf.jpg"

image = Image.open(IMAGE_PATH).convert("RGB")

input_tensor = preprocess_image(image).to(DEVICE)


# Generate Grad-CAM
cam, predicted_class = gradcam.generate(
    input_tensor
)


# Prediction name
if class_names:
    predicted_name = class_names[predicted_class]
else:
    predicted_name = str(predicted_class)


print("Predicted class:")
print(predicted_name)

print("Grad-CAM generated successfully.")


# Create overlay
result = overlay_heatmap(
    image,
    cam
)


# Save result
output_path = "gradcam_result.jpg"

result.save(output_path)

print(f"Grad-CAM result saved to: {output_path}")


# Remove hooks
gradcam.close()