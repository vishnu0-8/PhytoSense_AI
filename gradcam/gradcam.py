import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from torchvision import transforms

import config


class GradCAM:
    """
    Grad-CAM implementation for ResNet18.

    Generates a heatmap showing the image regions
    that contributed to the model's prediction.
    """

    def __init__(self, model, target_layer):
        self.model = model
        self.target_layer = target_layer

        self.activations = None
        self.gradients = None

        self.forward_hook = target_layer.register_forward_hook(
            self._save_activations
        )

        self.backward_hook = target_layer.register_full_backward_hook(
            self._save_gradients
        )

    def _save_activations(self, module, input, output):
        self.activations = output.detach()

    def _save_gradients(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def generate(self, input_tensor, target_class=None):
        """
        Generate a Grad-CAM heatmap.

        Args:
            input_tensor: Preprocessed image tensor [1, C, H, W]
            target_class: Class index to explain.
                          If None, explains the predicted class.

        Returns:
            cam: NumPy array containing values between 0 and 1.
            predicted_class: Predicted class index.
        """

        self.model.zero_grad()

        output = self.model(input_tensor)

        predicted_class = output.argmax(dim=1).item()

        if target_class is None:
            target_class = predicted_class

        score = output[:, target_class]

        score.backward()

        if self.activations is None or self.gradients is None:
            raise RuntimeError(
                "Grad-CAM could not obtain activations or gradients."
            )

        # Global average pooling of gradients
        weights = self.gradients.mean(
            dim=(2, 3),
            keepdim=True,
        )

        # Weighted combination of feature maps
        cam = (weights * self.activations).sum(dim=1)

        # Keep only positive contributions
        cam = F.relu(cam)

        # Resize heatmap to input image size
        cam = F.interpolate(
            cam.unsqueeze(1),
            size=input_tensor.shape[2:],
            mode="bilinear",
            align_corners=False,
        ).squeeze()

        # Convert to NumPy
        cam = cam.cpu().numpy()

        # Normalize between 0 and 1
        cam = cam - cam.min()

        if cam.max() > 0:
            cam = cam / cam.max()

        return cam, predicted_class

    def close(self):
        """Remove registered hooks."""

        self.forward_hook.remove()
        self.backward_hook.remove()


def preprocess_image(image):
    """
    Preprocess an image using the same normalization
    used during model training.
    """

    transform = transforms.Compose([
        transforms.Resize(
            (config.IMG_SIZE, config.IMG_SIZE)
        ),
        transforms.ToTensor(),
        transforms.Normalize(
            config.IMAGENET_MEAN,
            config.IMAGENET_STD,
        ),
    ])

    if isinstance(image, np.ndarray):
        image = Image.fromarray(image)

    image = image.convert("RGB")

    tensor = transform(image).unsqueeze(0)

    return tensor


def create_heatmap(cam):
    """
    Convert a normalized Grad-CAM array into
    a displayable grayscale heatmap.
    """

    heatmap = (cam * 255).astype(np.uint8)

    return Image.fromarray(heatmap, mode="L")


def overlay_heatmap(original_image, cam, alpha=0.45):
    """
    Overlay the Grad-CAM heatmap on the original image.
    """

    original_image = original_image.convert("RGB")

    heatmap = create_heatmap(cam)

    heatmap = heatmap.resize(
        original_image.size,
        Image.Resampling.BILINEAR,
    )

    # Use PIL's built-in color mapping.
    heatmap_rgb = Image.fromarray(
        np.stack(
            [
                np.array(heatmap),
                np.zeros_like(np.array(heatmap)),
                np.zeros_like(np.array(heatmap)),
            ],
            axis=2,
        ).astype(np.uint8)
    )

    result = Image.blend(
        original_image,
        heatmap_rgb,
        alpha=alpha,
    )

    return result