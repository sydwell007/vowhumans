# GPU deployment boundary

GPU workers deploy separately from the Studio and CPU services. Pin an approved CUDA base image, verify GPU memory at startup, warm permitted weights, expose authenticated private ingress only, record model/checksum/licence metadata, and publish memory/frame-latency metrics. A 4 GB GTX 1050 Ti was detected locally but is not assumed capable of production inference.

