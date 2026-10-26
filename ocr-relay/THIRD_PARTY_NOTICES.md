PP-OCRv4 recognition model: PaddlePaddle/PaddleOCR, distributed through RapidAI/RapidOCR 1.4.4, Apache License 2.0.
Model source: https://pypi.org/project/rapidocr-onnxruntime/1.4.4/
Upstream: https://github.com/PaddlePaddle/PaddleOCR and https://github.com/RapidAI/RapidOCR
Only the recognition model is used. Detection, orientation classification and the RapidOCR package are not production dependencies.
Model SHA-256: 48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b
Standard image normalization and CTC decoding in numeric_reader.py follow the model interface. See APACHE-2.0.txt for the model license.

PP-OCRv5 Korean recognition model: PaddlePaddle/PaddleOCR, distributed through RapidAI/RapidOCR v3.9.2, Apache License 2.0.
Model source: https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5/rec/korean_PP-OCRv5_rec_mobile.onnx
Official model catalog: https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/default_models.yaml
Model SHA-256: cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b
Only bounded text-line recognition is used; no model code or additional Python package is downloaded at request time.
