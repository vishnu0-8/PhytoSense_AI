# 🌱 Plant Disease Detection AI

A deep learning-based plant disease detection system that identifies diseases and healthy conditions from plant leaf images.

The project uses the **PlantVillage dataset** containing **38 classes** across multiple crop species. The model is developed using **PyTorch**, trained on a **Kaggle GPU environment**, and integrated into a user-friendly application using **Gradio**.

> **Project Status:** 🚧 Model training and evaluation are in progress.

---

## 🎯 Project Objective

The goal of this project is to develop an AI system that can identify plant diseases from leaf photographs.

The system will:

- Accept a plant leaf image as input
- Preprocess the image
- Classify the image using a deep learning model
- Predict the plant/disease category
- Identify whether the plant is healthy or affected by a disease
- Display confidence information for the prediction

The trained model will be integrated into a user-friendly **Gradio** application.

---

## 🌱 Dataset

This project uses the **PlantVillage dataset**.

The dataset contains approximately **54,000 images** covering **38 classes** of healthy and diseased plant leaves from multiple crop species.

For this project, the **color images** from the dataset are used.

### Dataset Classes

The project supports the following 38 classes:

| # | Class |
|---|---|
| 1 | Apple — Apple scab |
| 2 | Apple — Black rot |
| 3 | Apple — Cedar apple rust |
| 4 | Apple — Healthy |
| 5 | Blueberry — Healthy |
| 6 | Cherry — Powdery mildew |
| 7 | Cherry — Healthy |
| 8 | Corn — Cercospora leaf spot / Gray leaf spot |
| 9 | Corn — Common rust |
| 10 | Corn — Northern Leaf Blight |
| 11 | Corn — Healthy |
| 12 | Grape — Black rot |
| 13 | Grape — Esca (Black Measles) |
| 14 | Grape — Leaf blight |
| 15 | Grape — Healthy |
| 16 | Orange — Huanglongbing (Citrus greening) |
| 17 | Peach — Bacterial spot |
| 18 | Peach — Healthy |
| 19 | Pepper — Bacterial spot |
| 20 | Pepper — Healthy |
| 21 | Potato — Early blight |
| 22 | Potato — Late blight |
| 23 | Potato — Healthy |
| 24 | Raspberry — Healthy |
| 25 | Soybean — Healthy |
| 26 | Squash — Powdery mildew |
| 27 | Strawberry — Leaf scorch |
| 28 | Strawberry — Healthy |
| 29 | Tomato — Bacterial spot |
| 30 | Tomato — Early blight |
| 31 | Tomato — Late blight |
| 32 | Tomato — Leaf mold |
| 33 | Tomato — Septoria leaf spot |
| 34 | Tomato — Spider mites |
| 35 | Tomato — Target spot |
| 36 | Tomato — Tomato Yellow Leaf Curl Virus |
| 37 | Tomato — Tomato mosaic virus |
| 38 | Tomato — Healthy |

---

## 🧠 Model

The project uses **transfer learning with convolutional neural networks (CNNs)**.

### Primary Model

**ResNet18**

A pretrained ResNet18 model will be fine-tuned for classification of the 38 PlantVillage classes.

### Models for Future Comparison

The following architectures may also be evaluated:

- ResNet18
- ResNet34
- EfficientNet-B0
- MobileNetV2

The final model will be selected based on the actual evaluation results obtained during training.

> **Note:** No accuracy or performance results are claimed at this stage. Actual results will be added after training and evaluation.

---

## ⚙️ Training

Model training will be performed using a **Kaggle GPU environment**.

### Training Configuration

| Parameter | Value |
|---|---|
| Framework | PyTorch |
| Primary Model | ResNet18 |
| Number of Classes | 38 |
| Image Size | 224 × 224 |
| Batch Size | 32 |
| Optimizer | Adam |
| Learning Rate | 1e-3 |
| Weight Decay | 1e-4 |
| Scheduler | ReduceLROnPlateau |
| Scheduler Patience | 2 |
| Scheduler Factor | 0.5 |
| Early Stopping | Patience 5 |
| Random Seed | 42 |
| Training Environment | Kaggle GPU |

### Data Augmentation

The training pipeline includes:

- Random horizontal flip
- Random vertical flip
- Random rotation
- Color jitter
- Random affine transformation
- ImageNet normalization

---

## 📊 Model Evaluation

After training, the model will be evaluated using:

- Accuracy
- Precision
- Recall
- F1-score
- Confusion matrix
- Per-class performance
- Training and validation curves

Actual performance results will be documented after model training and evaluation.

---

## 🚀 Project Workflow

```text
PlantVillage Dataset
        │
        ▼
Data Preparation
        │
        ▼
Train / Validation Split
        │
        ▼
Image Preprocessing
        │
        ▼
Data Augmentation
        │
        ▼
ResNet18 Transfer Learning
        │
        ▼
Training on Kaggle GPU
        │
        ▼
Model Evaluation
        │
        ▼
best_model.pth
        │
        ▼
VS Code Application
        │
        ▼
Gradio Interface
        │
        ▼
Plant Disease Prediction
        │
        ▼
Hugging Face Spaces Deployment