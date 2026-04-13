#!/usr/bin/env python

from __future__ import print_function

import logging
import os
import sys
from itertools import product
from subprocess import PIPE, STDOUT, Popen

import yaml

try:
    from yaml import CLoader as Loader
except ImportError:
    from yaml import Loader

if any(opt in sys.argv for opt in ("-h", "--help")):
    print("usage: ./build.py")
    print("Builds all versions: real/anon x digital")
    sys.exit(0)

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger()

CONF_FILE = "resume.yaml"

try:
    conf = yaml.load(open(os.path.join(os.curdir, CONF_FILE), "rb"), Loader=Loader)
except:
    log.exception("error: unable to read {} config file:".format(CONF_FILE))
    raise

REAL_HEADER = conf["real_header"]

# anonymized header
ANON_HEADER = r"""
\begin{center}
    \hspace{-1.5cm}\Huge\textbf{Lexical Unit}
\end{center}
\vspace{-.2in}
\begin{tabular*}{7.0in}{l@{\extracolsep{\fill}}r}
    \hspace{-1.5cm}Portland, OR & \href{mailto:resume@lexicalunit.com}{resume@lexicalunit.com} \\
\end{tabular*}
\hrulefill
"""

# digital optimization (vs the default: print optimization)
DIGITAL_PREAMBLE = r"""
% sans-serif font is better for digital, but serif is better for print
\usepackage{gillius}
\renewcommand{\familydefault}{\sfdefault}
"""


def build_resume(build_real, build_digital):
    """Build a single version of the resume."""
    variant = "{}-{}".format(
        "real" if build_real else "anon",
        "digital" if build_digital else "paper",
    )
    log.info("Building {} version...".format(variant))

    # generate LaTeX source
    with open("resume.tex", "r") as f:
        data = f.read()

    if build_real:
        data = data.replace("% <Header>", REAL_HEADER)
    else:
        data = data.replace("% <Header>", ANON_HEADER)

    if build_digital:
        data = data.replace("% <Digital>", DIGITAL_PREAMBLE)

    if not build_real:
        lines = data.split("\n")
        for lineno, line in enumerate(lines):
            if line.startswith(r"\date"):
                lines[lineno] = r"\dates{}"
            elif line.startswith(r"\location"):
                lines[lineno] = r"\location{}"
            elif "University" in line:
                lines[lineno] = r"\employer{\textbf{School}}"
            elif line.startswith(r"\employer"):
                lines[lineno] = r"\employer{\textbf{Workplace}}"
        data = "\n".join(lines)

    print(data, file=open("built.tex", "w"))

    # run LaTeX processing
    p = Popen(
        ["/Library/TeX/texbin/pdflatex", "--file-line-error", "--synctex=1"],
        stdout=PIPE,
        stdin=PIPE,
        stderr=STDOUT,
    )
    out, err = p.communicate(input=data.encode("utf-8"))

    # show LaTeX processing output
    print(out)
    if err:
        print(err, file=sys.stderr)

    # sanity check
    assert os.path.isfile("texput.pdf"), "Failed to build {} version".format(variant)

    # cleanup
    os.remove("texput.log")
    os.remove("texput.synctex.gz")

    # determine output filename
    if build_real:
        base_path = os.path.expanduser(conf["real_resume_install_path"])
        base_name = base_path[:-4]  # strip .pdf
    else:
        base_name = "aresume"

    suffix = "-digital" if build_digital else "-paper"
    output = "{}{}.pdf".format(base_name, suffix)

    os.rename("texput.pdf", output)
    print("built {}".format(output))
    return output


def main():
    """Build all 4 versions of the resume."""
    built_files = []

    for build_real, build_digital in product([True, False], [True]):
        assert build_digital
        output = build_resume(build_real, build_digital)
        built_files.append(output)

    print("\n" + "=" * 40)
    print("Successfully built {} versions:".format(len(built_files)))
    for f in built_files:
        print("  - {}".format(f))


if __name__ == "__main__":
    main()
